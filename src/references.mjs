export function linksForCommit(commit, remote) {
  if (!commit || !remote?.webUrl) {
    return { commit: null, pullRequest: null, issues: [] };
  }
  const message = `${commit.subject}\n${commit.body}`;
  const pullRequestMatch = message.match(/(?:merge pull request\s+|\()#(\d+)(?:\)|\b)/i);
  const pullRequestNumber = pullRequestMatch ? Number(pullRequestMatch[1]) : null;
  const issueNumbers = new Set();
  const issuePattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  for (const match of message.matchAll(issuePattern)) {
    const number = Number(match[1]);
    if (number !== pullRequestNumber) issueNumbers.add(number);
  }
  return {
    commit: `${remote.webUrl}/commit/${commit.hash}`,
    pullRequest: pullRequestNumber === null
      ? null
      : {
        number: pullRequestNumber,
        url: `${remote.webUrl}/pull/${pullRequestNumber}`,
      },
    issues: [...issueNumbers].sort((left, right) => left - right).map((number) => ({
      number,
      url: `${remote.webUrl}/issues/${number}`,
    })),
  };
}
