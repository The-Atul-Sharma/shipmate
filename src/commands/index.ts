import * as vscode from 'vscode';
import { ShipmatePanel } from '../panel';
import * as commitCmd from './commit';
import * as gitCmd from './git';
import * as prCmd from './pr';
import * as reviewCmd from './review';
import * as testGenCmd from './testGen';
import * as specCmd from './spec';
import * as qualityCmd from './quality';
import { switchModel } from './model';
import { manageKeys, configureAIKey, configureGitHubKey, setProvider, deleteKey } from './keys';
import { SecretKey } from '../core/secrets';
import * as uiCmd from './ui';
import * as gitOps from '../core/git/ops';
import { cancelRun } from '../core/run';
import { cancelQualityCheck } from './quality';
import { logger } from '../core/logger';
import { toast } from '../core/notify';

export function registerCommands(ctx: vscode.ExtensionContext, panel: ShipmatePanel): void {
  const sub = (id: string, fn: (...args: any[]) => any) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

  sub('shipmate.showPanel', () => panel.reveal());
  sub('shipmate.generateCommitMessage', () => commitCmd.generateCommitMessage(panel));
  sub('shipmate.commit', async (msg: string) => {
    await commitCmd.commit(msg);
    await panel.refreshGit();
  });
  sub('shipmate.commitAndPush', async (msg: string) => {
    await commitCmd.commitAndPush(msg);
    await panel.refreshGit();
  });

  sub('shipmate.createPR', () => prCmd.createPR());
  sub('shipmate.reviewCurrentPR', (prNumber?: number) => reviewCmd.reviewCurrentPR(panel, prNumber));
  sub('shipmate.postReview', (args) => reviewCmd.postReview(panel, args));
  sub('shipmate.fixAllBlockers', (args) => reviewCmd.fixAllBlockers(panel, args));
  sub('shipmate.fixSelectedComment', (args) => reviewCmd.fixSelectedComment(panel, args));
  sub('shipmate.deleteComment', (args) => reviewCmd.deleteComment(panel, args));

  sub('shipmate.generateTestsForFile', (file?: string) =>
    testGenCmd.generateTestsForFile(ctx, panel, file)
  );
  sub('shipmate.generateSpecForFile', (file?: string) =>
    specCmd.generateSpecForFile(panel, file)
  );

  sub('shipmate.runQualityCheck', (req) =>
    qualityCmd.runQualityCheck(ctx, panel, req)
  );

  sub('shipmate.switchModel', (id?: string) => switchModel(id));
  sub('shipmate.manageKeys', () => manageKeys(panel));

  // UI bridge commands invoked from the webview.
  sub('shipmate.refresh', () => panel.refresh());
  sub('shipmate.cancel', (channel?: string) => {
    // Cancel only the requested operation so concurrent runs are unaffected.
    if (channel && channel !== 'quality') {
      cancelRun(channel);
      return;
    }
    if (channel === 'quality') {
      cancelQualityCheck();
      return;
    }
    cancelRun();
    cancelQualityCheck();
  });
  sub('shipmate.openDiff', (args) => uiCmd.openDiff(args));
  sub('shipmate.openPRDiff', (args) => uiCmd.openPRDiff(args));
  sub('shipmate.closeDiff', () => uiCmd.closeDiff());
  sub('shipmate.openFileAtLine', (args) => uiCmd.openFileAtLine(args));
  sub('shipmate.initRepo', () => uiCmd.initRepo());
  sub('shipmate.openPRInBrowser', (args) => uiCmd.openPRInBrowser(args));
  sub('shipmate.refreshComments', () => uiCmd.refreshComments(panel));
  sub('shipmate.saveTests', (args) => uiCmd.saveGenerated('tests', args));
  sub('shipmate.saveSpec', (args) => uiCmd.saveGenerated('spec', args));
  sub('shipmate.attachQualityToPR', (args) => uiCmd.attachQualityToPR(args));
  sub('shipmate.pickFile', (args) => uiCmd.pickFile(panel, args));
  sub('shipmate.stage', async (p: string) => {
    try {
      await gitOps.stage([p]);
    } catch (err) {
      logger.error('stage failed', err);
    }
    await panel.refreshGit();
  });
  sub('shipmate.unstage', async (p: string) => {
    try {
      await gitOps.unstage([p]);
    } catch (err) {
      logger.error('unstage failed', err);
    }
    await panel.refreshGit();
  });
  sub('shipmate.stageAll', async () => {
    try {
      await gitOps.stageAll();
    } catch (err) {
      logger.error('stage all failed', err);
    }
    await panel.refreshGit();
  });
  sub('shipmate.discardFile', async (p: string) => {
    const choice = await vscode.window.showWarningMessage(
      `Discard all changes to ${p}? This cannot be undone.`,
      { modal: true },
      'Discard'
    );
    if (choice !== 'Discard') {
      return;
    }
    try {
      await gitOps.discard(p);
      toast('info', `Discarded changes to ${p}.`);
    } catch (err) {
      logger.error('discard failed', err);
      toast('error', `Discard failed — ${(err as Error).message}`);
    }
    await panel.refreshGit();
  });
  sub('shipmate.discardAll', async () => {
    const choice = await vscode.window.showWarningMessage(
      'Discard ALL changes in the working tree? Modified files are reverted and untracked files are deleted. This cannot be undone.',
      { modal: true },
      'Discard All'
    );
    if (choice !== 'Discard All') {
      return;
    }
    try {
      await gitOps.discardAll();
      toast('info', 'Discarded all changes.');
    } catch (err) {
      logger.error('discard all failed', err);
      toast('error', `Discard all failed — ${(err as Error).message}`);
    }
    await panel.refreshGit();
  });
  sub('shipmate.unstageAll', async () => {
    try {
      await gitOps.unstageAll();
    } catch (err) {
      logger.error('unstage all failed', err);
    }
    await panel.refreshGit();
  });
  sub('shipmate.configureAIKey', (provider?: string) => configureAIKey(provider, panel));
  sub('shipmate.configureGitHubKey', () => configureGitHubKey(panel));
  sub('shipmate.setProvider', (provider: string) => setProvider(provider, panel));
  sub('shipmate.deleteKey', (key: SecretKey) => deleteKey(key, panel));

  sub('shipmate.showStatus', () => logger.show());
  sub('shipmate.toggleAIMode', async () => {
    const cfg = vscode.workspace.getConfiguration('shipmate');
    const next = cfg.get('defaultMode') === 'shipmate' ? 'native' : 'shipmate';
    await cfg.update('defaultMode', next, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Shipmate: mode → ${next}.`);
  });

  // Git mutations refresh the panel afterwards so branch / ahead-behind / file
  // lists never go stale (e.g. the branch name after a checkout).
  const afterGit = (fn: (...a: any[]) => Promise<void> | void) => async (...a: any[]) => {
    await fn(...a);
    await panel.refreshGit();
  };
  sub('shipmate.checkout', afterGit((branch?: string) => gitCmd.checkout(branch)));
  sub('shipmate.createBranch', afterGit((name?: string) => gitCmd.createBranch(name)));
  sub('shipmate.pullBranch', afterGit(() => gitCmd.pullBranch()));
  sub('shipmate.pushBranch', afterGit(() => gitCmd.pushBranch()));
  sub('shipmate.fetchRemote', afterGit(() => gitCmd.fetchRemote()));
  sub('shipmate.stashList', () => gitCmd.stashList());
  sub('shipmate.stashChanges', afterGit(() => gitCmd.stashPush()));
  sub('shipmate.stashApply', afterGit((i: number) => gitCmd.stashApply(i)));
  sub('shipmate.stashPop', afterGit((i: number) => gitCmd.stashPop(i)));
  sub('shipmate.stashDrop', afterGit((i: number) => gitCmd.stashDrop(i)));
}
