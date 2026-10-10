import { Sendable } from '../../models/Sendable';
import { TaskBuilder } from '../../models/TaskBuilder';
import { htmlToElement } from '../../utils/dom';
import { request } from '../../utils/request';
import { Parser } from '../Parser';

interface ZeroJudgeProblem {
  problemid: string;
  title: string;
  memorylimit: number;
  testdataPairs: { timelimit: number }[];
  sampleinputs: string[];
  sampleoutputs: string[];
}

// ZeroJudge deployments, including the school-hosted one
export const ZEROJUDGE_DOMAINS: Record<string, string> = {
  'zerojudge.tw': 'ZeroJudge',
  'ckzerojudge.ck.tp.edu.tw': 'CK ZeroJudge',
};

export const ZEROJUDGE_DOMAIN_PATTERN = Object.keys(ZEROJUDGE_DOMAINS)
  .map(domain => domain.replace(/\./g, '\\.'))
  .join('|');

export class ZeroJudgeProblemParser extends Parser {
  public getMatchPatterns(): string[] {
    const patterns = [];

    for (const domain of Object.keys(ZEROJUDGE_DOMAINS)) {
      for (const protocol of ['https', 'http']) {
        patterns.push(`${protocol}://${domain}/ShowProblem*`);
      }
    }

    return patterns;
  }

  public getRegularExpressions(): RegExp[] {
    return [new RegExp(`^https?://(?:${ZEROJUDGE_DOMAIN_PATTERN})/ShowProblem\\?(?:.*&)?problemid=\\w+`)];
  }

  public async parse(url: string, html: string): Promise<Sendable> {
    const { hostname, origin, searchParams } = new URL(url);
    const judge = ZEROJUDGE_DOMAINS[hostname] ?? 'ZeroJudge';
    const problemId = searchParams.get('problemid');

    const task = new TaskBuilder(judge).setUrl(url);

    // ZeroJudge 4 renders the problem client-side from this endpoint; older versions don't have it
    let problem: ZeroJudgeProblem | null;
    try {
      const body = JSON.parse(await request(`${origin}/ShowProblem.api?problemid=${problemId}`, {}, 0));
      problem = body.success ? body.data.result : null;
    } catch {
      problem = null;
    }

    if (problem !== null) {
      this.parseFromApi(problem, task);
    } else {
      this.parseFromPage(problemId, html, task);
    }

    return task.build();
  }

  private parseFromApi(problem: ZeroJudgeProblem, task: TaskBuilder): void {
    task.setName(`${problem.problemid}. ${problem.title}`);

    for (let i = 0; i < problem.sampleinputs.length && i < problem.sampleoutputs.length; i++) {
      task.addTest(problem.sampleinputs[i], problem.sampleoutputs[i]);
    }

    // Time limits are given per testdata in seconds
    if (problem.testdataPairs.length > 0) {
      task.setTimeLimit(Math.max(...problem.testdataPairs.map(pair => pair.timelimit)) * 1000);
    }

    task.setMemoryLimit(problem.memorylimit);
  }

  private parseFromPage(problemId: string, html: string, task: TaskBuilder): void {
    const elem = htmlToElement(html);

    task.setName(`${problemId}. ${elem.querySelector('#problem_title').textContent.trim()}`);

    // Sample panels are titled "範例輸入 #1", "範例輸出 #1", and so on
    const blocks = [...elem.querySelectorAll('.panel')]
      .filter(panel => /#\s*\d+\s*$/.test(panel.querySelector('.panel-heading')?.textContent ?? ''))
      .map(panel => panel.querySelector('pre'))
      .filter(block => block !== null);

    for (let i = 0; i < blocks.length - 1; i += 2) {
      task.addTest(blocks[i].textContent, blocks[i + 1].textContent);
    }

    // The testdata panel reads "記憶體限制： 512 MB" followed by "公開 測資點#0 (33%): 1.0s , <1K" for each testdata
    const limitsPanel = [...elem.querySelectorAll('.panel')].find(panel => /測資點/.test(panel.textContent));
    if (limitsPanel === undefined) {
      return;
    }

    const limitsStr = limitsPanel.textContent;

    const timeLimits = [...limitsStr.matchAll(/([\d.]+)\s*s\b/g)].map(match => parseFloat(match[1]));
    if (timeLimits.length > 0) {
      task.setTimeLimit(Math.max(...timeLimits) * 1000);
    }

    const memoryLimit = /(\d+)\s*MB/.exec(limitsStr);
    if (memoryLimit !== null) {
      task.setMemoryLimit(parseInt(memoryLimit[1], 10));
    }
  }
}
