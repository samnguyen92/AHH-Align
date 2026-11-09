#!/usr/bin/env python3
"""
scripts/benchmark_search.py — Track D 30-Query Search Benchmark Suite.
Runs 30 real patient queries (treatments, symptoms, multilingual terms in VI/KO/ZH,
and insurance networks) against the live Supabase clinics index and reports
Legacy Search vs Deep Search hit rates.
"""

import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT_DIR, "openclaw"))

from audit_directory import format_search_benchmark_report  # noqa: E402

if __name__ == "__main__":
    print(format_search_benchmark_report())

