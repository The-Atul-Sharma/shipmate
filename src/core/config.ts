import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { logger } from './logger';

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama';
export type PlatformKind = 'github' | 'gitlab' | 'azure';

export interface ShipmateConfig {
  provider: ProviderId;
  model: string;
  reviewStrictness: 'lenient' | 'balanced' | 'strict';
  platform: PlatformKind;
  defaultMode: 'shipmate' | 'native';
  runQualityOnPRCreate: boolean;
  codebaseProfileEnabled: boolean;
  qualityPorts: number[];
  qualityBuild: QualityBuildConfig;
}

/**
 * How the Quality tab obtains a *production* build to audit. Either Shipmate
 * builds the project and serves the output dir itself, or it drives a
 * user-provided preview server.
 */
export interface QualityBuildConfig {
  /** Build command run before auditing (e.g. `npm run build`). */
  command: string;
  /** Output dir to serve. When omitted, common dirs are auto-detected. */
  dir?: string;
  /** Optional: run this preview server instead of Shipmate's static server. */
  previewCommand?: string;
  /** URL the preview server listens on; required when previewCommand is set. */
  previewUrl?: string;
}

const DEFAULT_PORTS = [3000, 5173, 8080, 4200, 8000, 3001];
const DEFAULT_BUILD: QualityBuildConfig = { command: 'npm run build' };

function readYaml(root: string): Record<string, any> {
  const file = path.join(root, 'shipmate.config.yml');
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return parse(fs.readFileSync(file, 'utf8')) ?? {};
  } catch (err) {
    logger.error('Failed to parse shipmate.config.yml', err);
    return {};
  }
}

export function loadConfig(): ShipmateConfig {
  const cfg = vscode.workspace.getConfiguration('shipmate');
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const yml = root ? readYaml(root) : {};

  return {
    provider: yml.ai?.provider ?? cfg.get<ProviderId>('aiProvider', 'anthropic'),
    model: yml.ai?.model ?? cfg.get<string>('model', 'claude-opus-4'),
    reviewStrictness:
      yml.ai?.reviewStrictness ?? cfg.get('reviewStrictness', 'balanced'),
    platform: yml.platform?.kind ?? 'github',
    defaultMode: cfg.get('defaultMode', 'shipmate'),
    runQualityOnPRCreate: cfg.get('runQualityOnPRCreate', false),
    codebaseProfileEnabled: cfg.get('codebaseProfileEnabled', true),
    qualityPorts: yml.quality?.ports ?? DEFAULT_PORTS,
    qualityBuild: {
      command: yml.quality?.build?.command ?? DEFAULT_BUILD.command,
      dir: yml.quality?.build?.dir,
      previewCommand: yml.quality?.build?.previewCommand,
      previewUrl: yml.quality?.build?.previewUrl
    }
  };
}
