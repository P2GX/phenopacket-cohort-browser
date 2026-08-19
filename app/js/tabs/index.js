// Tab registration — order here = order in the nav bar.
//
// TO ADD A NEW TAB:
//   1. app/py/cohort_stats/mytab.py    → compute(packets) -> dict
//      + register it in TAB_COMPUTES (app/py/cohort_stats/__init__.py)
//      + add the file to app/py/manifest.json
//   2. app/js/tabs/mytab.js            → { id, label, computeKey, render() }
//      (copy diseases.js — it's the smallest example)
//   3. Import + register it below.

import { registerTab } from '../core/registry.js';

import demographics from './demographics.js';
import diagnoses from './diagnoses.js';
import genes from './genes.js';
import phenotypes from './phenotypes.js';
import diseases from './diseases.js';
import measurements from './measurements.js';
import browser from './browser.js';
import about from './about.js';

[demographics, diagnoses, genes, phenotypes, diseases, measurements, browser, about]
  .forEach(registerTab);
