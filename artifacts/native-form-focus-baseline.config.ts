import { defineConfig, devices } from '@playwright/test';
import '../playwright.config';
export default defineConfig({ testDir:'.', testMatch:'native-form-focus-baseline.spec.ts', workers:1,
  outputDir:'native-form-focus-baseline-20261103', use:{ ...devices['Desktop Firefox'], headless:true, video:'on', trace:'on' },
});
