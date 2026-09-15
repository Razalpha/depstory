import { runGitHubAction } from "../src/github-action.mjs";

runGitHubAction({
  repositoryPath: process.env.GITHUB_WORKSPACE,
  base: process.env.DEPSTORY_BASE,
  head: process.env.DEPSTORY_HEAD,
  workspace: process.env.DEPSTORY_WORKSPACE,
  summaryPath: process.env.GITHUB_STEP_SUMMARY,
  outputPath: process.env.GITHUB_OUTPUT,
}).catch((error) => {
  console.error(`depstory: ${error.message}`);
  process.exitCode = 1;
});
