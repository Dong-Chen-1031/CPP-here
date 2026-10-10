import { ZEROJUDGE_DOMAIN_PATTERN, ZEROJUDGE_DOMAINS, ZeroJudgeProblemParser } from '../problem/ZeroJudgeProblemParser';
import { SimpleContestParser } from '../SimpleContestParser';

// Contest problems are only listed after joining the contest
export class ZeroJudgeContestParser extends SimpleContestParser {
  protected linkSelector = 'table a[href*="ShowProblem?problemid="]';
  protected problemParser = new ZeroJudgeProblemParser();

  public getMatchPatterns(): string[] {
    const patterns = [];

    for (const domain of Object.keys(ZEROJUDGE_DOMAINS)) {
      for (const protocol of ['https', 'http']) {
        patterns.push(`${protocol}://${domain}/ShowContest*`);
      }
    }

    return patterns;
  }

  public getRegularExpressions(): RegExp[] {
    return [new RegExp(`^https?://(?:${ZEROJUDGE_DOMAIN_PATTERN})/ShowContest\\?(?:.*&)?contestid=\\d+`)];
  }
}
