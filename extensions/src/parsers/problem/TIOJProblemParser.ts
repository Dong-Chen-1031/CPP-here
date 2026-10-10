import { Sendable } from '../../models/Sendable';
import { TaskBuilder } from '../../models/TaskBuilder';
import { htmlToElement } from '../../utils/dom';
import { Parser } from '../Parser';

// Forks of TIOJ that share its problem pages
export const TIOJ_DOMAINS: Record<string, string> = {
  'tioj.ck.tp.edu.tw': 'TIOJ',
  'oj.ntucpc.org': 'NTUCPC OJ',
  'iscoj.ckefgisc.org': 'ISCOJ',
};

export const TIOJ_DOMAIN_PATTERN = Object.keys(TIOJ_DOMAINS)
  .map(domain => domain.replace(/\./g, '\\.'))
  .join('|');

export class TIOJProblemParser extends Parser {
  public getMatchPatterns(): string[] {
    const patterns = [];

    for (const domain of Object.keys(TIOJ_DOMAINS)) {
      for (const path of ['problems/*', 'contests/*/problems/*']) {
        patterns.push(`https://${domain}/${path}`);
      }
    }

    return patterns;
  }

  public getRegularExpressions(): RegExp[] {
    return [new RegExp(`^https://(?:${TIOJ_DOMAIN_PATTERN})/(?:contests/\\d+/)?problems/\\d+/?(?:[?#].*)?$`)];
  }

  public async parse(url: string, html: string): Promise<Sendable> {
    const domain = Object.entries(TIOJ_DOMAINS).find(entry => url.startsWith(`https://${entry[0]}/`));
    const judge = domain !== undefined ? domain[1] : 'TIOJ';

    const elem = htmlToElement(html);
    const task = new TaskBuilder(judge).setUrl(url);

    // The header reads "1001 . Hello World!"
    const header = elem.querySelector('h4.page-header').textContent.replace(/\s+/g, ' ').trim();
    task.setName(header.replace(/^(\S+) \. /, '$1. '));

    const blocks = elem.querySelectorAll('pre.sample-testdata');
    for (let i = 0; i < blocks.length - 1; i += 2) {
      task.addTest(blocks[i].textContent, blocks[i + 1].textContent);
    }

    this.parseLimits(elem, task);

    return task.build();
  }

  // Limits are listed per testdata in a table, so the largest one is used
  private parseLimits(elem: Element, task: TaskBuilder): void {
    for (const table of elem.querySelectorAll('table')) {
      const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent);
      const timeColumn = headers.findIndex(header => /Time Limit/i.test(header));
      // Some forks have both a VSS and an RSS memory limit, the stricter of which applies
      const memoryColumns = headers.map((header, i) => (/Memory Limit/i.test(header) ? i : -1)).filter(i => i !== -1);

      if (timeColumn === -1 || memoryColumns.length === 0) {
        continue;
      }

      const rows = [...table.querySelectorAll('tbody tr')].map(row =>
        [...row.querySelectorAll('td')].map(cell => parseFloat(cell.textContent)),
      );

      const timeLimits = rows.map(row => row[timeColumn]).filter(limit => !isNaN(limit));
      if (timeLimits.length > 0) {
        task.setTimeLimit(Math.max(...timeLimits));
      }

      const memoryLimits = rows
        .map(row => Math.min(...memoryColumns.map(i => row[i]).filter(limit => !isNaN(limit))))
        .filter(limit => isFinite(limit));
      if (memoryLimits.length > 0) {
        task.setMemoryLimit(Math.max(...memoryLimits) / 1024);
      }

      return;
    }
  }
}
