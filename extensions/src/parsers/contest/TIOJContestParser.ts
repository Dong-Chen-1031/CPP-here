import { TIOJ_DOMAIN_PATTERN, TIOJ_DOMAINS, TIOJProblemParser } from '../problem/TIOJProblemParser';
import { SimpleContestParser } from '../SimpleContestParser';

export class TIOJContestParser extends SimpleContestParser {
  protected linkSelector = '#page-content a[href^="/contests/"][href*="/problems/"]';
  protected problemParser = new TIOJProblemParser();

  public getMatchPatterns(): string[] {
    return Object.keys(TIOJ_DOMAINS).map(domain => `https://${domain}/contests/*`);
  }

  public getRegularExpressions(): RegExp[] {
    return [new RegExp(`^https://(?:${TIOJ_DOMAIN_PATTERN})/contests/\\d+/?(?:[?#].*)?$`)];
  }
}
