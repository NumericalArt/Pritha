#!/usr/bin/env python3
"""Compatibility entrypoint; the implementation lives in pritha_web."""
import runpy

if __name__ == "__main__":
    runpy.run_module("pritha_web", run_name="__main__")
