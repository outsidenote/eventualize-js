#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'test.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const patterns = config.testPatterns.join(' ');

process.stdout.write(patterns);
