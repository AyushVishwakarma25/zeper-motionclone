"""Tests for Phase 10 Item 8: UI fixes, button bounding box checks at 390x844 & 1440x900,
needs_attention display, and credit estimate.
"""
from pathlib import Path
import pytest
from scripts.check_mobile_390 import check_viewports


def test_ui_viewports_and_button_bounds():
    # Runs the Playwright script verifying no button overflows 390x844 or 1440x900
    check_viewports()
