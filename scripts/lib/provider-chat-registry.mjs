import { createHash,randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { NeuralDeepChatHistoryStore,ChatHistoryError } from '../neuraldeep/chat-history-store.mjs';
import { privateStateFile } from './private-state-path.mjs';
import { isProviderConnectorId } from './provider-profile.mjs';
import {normalizeChatSubject} from './chat-subject.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now=()=>new Date().toISOString();
const model=/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/;
const client=/^[A-Za-z0-9_-]{8,128}$/;
const immutable=['chatId','connectorId','providerId','modelId','effortId','timeoutMs','workspacePath','workspace','capabilitySnapshot','executionConfig','stateIdentityHash','clientThreadId','createHash','subject','voiceTopicId','voiceTopicGeneration','origin','group'];
const fail=(code,message='The saved task identity does not match this request.')=>new ChatHistoryError(code,message);

/** Provider-owned transcripts share the reviewed bounded history engine, never native Codex history. */
export class ProviderChatRegistry {
  constructor({stateRoot,privateRoot,connectorId}){
    if(!isProviderConnectorId(connectorId) || connectorId==='codex')throw fail('provider_profile_invalid');
    this.connectorId=connectorId;
    const databasePath=privateStateFile(stateRoot,path.join(privateRoot,connectorId,'history.sqlite'));
    privateStateFile(stateRoot,`${databasePath}-wal`);privateStateFile(stateRoot,`${databasePath}-shm`);
    this.scope=digest([realpathSync(stateRoot),connectorId]);
    this.history=new NeuralDeepChatHistoryStore({databasePath,instanceScope:this.scope});
    this.history.db.exec('CREATE TABLE IF NOT EXISTS provider_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,chat TEXT NOT NULL,record TEXT NOT NULL); CREATE INDEX IF NOT EXISTS provider_events_chat ON provider_events(chat,sequence);');
  }
  close(){this.history.close();}
  assertId(chatId){if(!new RegExp(`^chat_${this.connectorId}_[a-f0-9]{32}$`).test(chatId))throw fail('thread_not_found','Task Chat was not found.');}
  get(chatId){
    this.assertId(chatId);const value=this.history.get(chatId,{turnLimit:0});
    if(!value)return null;
    if(value.connectorId!==this.connectorId || value.stateIdentityHash!==this.scope || !model.test(value.modelId || ''))throw fail('runtime_identity_mismatch');
    normalizeChatSubject(value.subject);
    return value;
  }
  require(chatId){const value=this.get(chatId);if(!value)throw fail('thread_not_found','Task Chat was not found.');return value;}
  findByClient(clientThreadId){const value=this.history.findByClient(clientThreadId);return value?this.require(value.chatId):null;}
  create(input){
    const subject=normalizeChatSubject(input.subject);
    if(input.voice && (!/^topic_[a-f0-9]{40}$/.test(input.voice.topicId) || !Number.isSafeInteger(input.voice.generation) || input.voice.generation<1 || input.voice.generation>999))throw fail('voice_topic_identity_invalid');
    if(!client.test(input.clientThreadId || '') || !model.test(input.modelId || '') || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs<1000 || input.timeoutMs>3600000)throw fail('provider_binding_invalid');
    const requestHash=digest(input.request),chatId=`chat_${this.connectorId}_${digest(input.clientThreadId).slice(0,32)}`;
    const stamp=now();
    return this.history.transaction(()=>{
      const prior=this.findByClient(input.clientThreadId);
      if(prior){if(prior.createHash!==requestHash || prior.modelId!==input.modelId)throw fail('idempotency_conflict');return {binding:prior,created:false};}
      const binding={chatId,clientThreadId:input.clientThreadId,createHash:requestHash,connectorId:this.connectorId,
        ...(subject?{subject}:{}),
        providerId:`${this.connectorId}_runtime`,modelId:input.modelId,effortId:input.effortId || null,timeoutMs:input.timeoutMs,
        workspacePath:realpathSync(input.workspacePath),workspace:input.workspace || null,nativeThreadId:'',profileIdentity:null,stateIdentityHash:this.scope,
        title:String(input.title || 'New task chat').trim().slice(0,120),preview:'',createdAt:stamp,updatedAt:stamp,
        group:input.voice?'voice_work':'my_chats',origin:input.voice?'voice':'chat',continuationEnabled:true,
        ...(input.voice?{voiceTopicId:input.voice.topicId,voiceTopicGeneration:input.voice.generation}:{}),
        pinned:false,archived:false,lastStatus:'idle',taskLinks:[],messageReceipts:{},turns:[],
        capabilitySnapshot:input.capabilitySnapshot || null,executionConfig:input.executionConfig || null};
      this.history.put(binding);return {binding:this.require(chatId),created:true};
    });
  }
  mutate(chatId,update){
    this.require(chatId);
    return this.history.mutate(chatId,current=>{
      const original=structuredClone(current),next=update(structuredClone(current));
      if(!next || immutable.some(key=>JSON.stringify(next[key])!==JSON.stringify(original[key])))throw fail('runtime_identity_mismatch');
      if(original.nativeThreadId && next.nativeThreadId!==original.nativeThreadId || original.profileIdentity && next.profileIdentity!==original.profileIdentity)throw fail('runtime_identity_mismatch');
      return next;
    })?.binding || null;
  }
  pinSession(chatId,sessionId,profileIdentity){
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sessionId || '') || !/^[a-f0-9]{64}$/.test(profileIdentity || ''))throw fail('runtime_identity_mismatch');
    return this.mutate(chatId,current=>({...current,nativeThreadId:sessionId,profileIdentity}));
  }
  reserveTurn(chatId,input){
    this.require(chatId);
    if(!client.test(input.clientMessageId || '') || typeof input.text!=='string' || (!input.text.trim() && !input.attachments?.length) || Buffer.byteLength(input.text)>64000)throw fail('invalid_request');
    const requestHash=digest(input.request);
    return this.history.transaction(()=>{
      const prior=this.history.receipt(chatId,input.clientMessageId);
      if(prior){if(prior.kind!=='message' || prior.value.requestHash!==requestHash)throw fail('idempotency_conflict');const turn=this.history.turn(chatId,prior.value.turnId);if(!turn)throw fail('history_receipt_incomplete','The original turn needs history recovery.');return {turn,created:false};}
      const stamp=now(),turnId=`turn_${randomUUID().replaceAll('-','')}`;
      const turn={turnId,clientMessageId:input.clientMessageId,status:'queued',startedAt:stamp,completedAt:null,error:null,pendingRequestIds:[],items:[],
        userMessage:{id:`item_${randomUUID().replaceAll('-','')}`,role:'user',markdown:input.text,status:'completed',createdAt:stamp,...(input.attachments?.length?{attachments:input.attachments}: {})}};
      this.history.putTurn(chatId,turn);
      this.history.putReceipt(chatId,input.clientMessageId,'message',{clientMessageId:input.clientMessageId,requestHash,turnId,startedAt:stamp});
      this.mutate(chatId,current=>({...current,preview:(input.text || input.attachments.map(file=>file.name).join(', ')).slice(0,500),updatedAt:stamp}));
      return {turn:this.history.turn(chatId,turnId),created:true};
    });
  }
  turn(chatId,turnId){this.require(chatId);return this.history.turn(chatId,turnId);}
  updateTurn(chatId,turnId,update){this.require(chatId);return this.history.mutateTurn(chatId,turnId,current=>{const next=update(structuredClone(current));if(!next || next.turnId!==current.turnId || next.clientMessageId!==current.clientMessageId)throw fail('runtime_identity_mismatch');return next;});}
  putItem(chatId,turnId,item,originalText){this.require(chatId);if(!this.history.turnState(chatId,turnId))throw fail('turn_not_found');return this.history.putItem(chatId,turnId,item,originalText);}
  list(input={}){return this.history.summaries().list(input);}
  turnsPage(chatId,input={}){this.require(chatId);return this.history.turnsPage(chatId,input);}
  itemsPage(chatId,turnId,cursor,activity=false){this.require(chatId);return this.history.itemsPage(chatId,turnId,cursor,activity);}
  content(chatId,itemId,cursor){this.require(chatId);return this.history.content(chatId,itemId,cursor);}
  appendEvent(chatId,event,payload={},refs={}){
    this.require(chatId);
    return this.history.transaction(()=>{
      const record={event,data:{apiVersion:'1',eventId:'',occurredAt:now(),chatId,turnId:refs.turnId || null,itemId:refs.itemId || null,requestId:refs.requestId || null,payload}};
      if(Buffer.byteLength(JSON.stringify(record))>256*1024)throw fail('provider_event_too_large');
      const result=this.history.db.prepare('INSERT INTO provider_events(chat,record) VALUES(?,?)').run(chatId,JSON.stringify(record));
      const id=Number(result.lastInsertRowid);record.data.eventId=`event_${this.connectorId}_${id}`;
      this.history.db.prepare('UPDATE provider_events SET record=? WHERE sequence=?').run(JSON.stringify(record),id);
      this.history.db.prepare('DELETE FROM provider_events WHERE sequence<=?').run(id-10000);
      return record;
    });
  }
  eventsAfter(chatId,eventId){
    this.require(chatId);
    if(!eventId)return {events:[],reset:false};
    const match=new RegExp(`^event_${this.connectorId}_([0-9]+)$`).exec(eventId);
    const id=Number(match?.[1]);
    const found=Number.isSafeInteger(id) && this.history.db.prepare('SELECT chat FROM provider_events WHERE sequence=?').get(id);
    if(!found || found.chat!==chatId)return {events:[],reset:true};
    const rows=this.history.db.prepare('SELECT record FROM provider_events WHERE chat=? AND sequence>? ORDER BY sequence LIMIT 257').all(chatId,id);
    if(rows.length>256)return {events:[],reset:true};
    return {events:rows.map(row=>JSON.parse(row.record)),reset:false};
  }
  latestEventId(chatId){this.require(chatId);const row=this.history.db.prepare('SELECT record FROM provider_events WHERE chat=? ORDER BY sequence DESC LIMIT 1').get(chatId);return row ? JSON.parse(row.record).data.eventId : '';}
}
