export const getVersionForBranchMaven = (branch: string, pomFilePath: string, propertiesFilePath: string): string[] => {
  if(branch == 'master' || branch == 'main') {
    return [
      `mvn -f ${pomFilePath} versions:set -DremoveSnapshot=true"`,
      `mvn -f ${pomFilePath} clean install deploy`,
      `export VERSION=\`grep -oP \'version=\\K.*\' ${propertiesFilePath}\``,
    ]
  }
  
  if (branch == 'develop') {
    return [
      `export COMMIT_SHA_SHORT=\`git rev-parse --short HEAD\``,
      `export VERSION=\`grep -oP \'version=\\K.*\' ${propertiesFilePath}\``,
      'export VERSION=$VERSION$COMMIT_SHA_SHORT',
    ]
  }

  if (branch.match(`release*`)) {
    return [
      `mvn -f ${pomFilePath} versions:set -DremoveSnapshot=true"`,
      `mvn -f ${pomFilePath} clean install deploy`,
      `export COMMIT_SHA_SHORT=\`git rev-parse --short HEAD\``,
      `export VERSION=\`grep -oP \'version=\\K.*\' ${propertiesFilePath}\``,
      'export VERSION=$VERSION-$COMMIT_SHA_SHORT',
    ]
  }

  return [];
}

export const setNextVersionMaven = (repositoryName: string, branch: string): string[] => {
  const commands: string[] = [
    'git config user.email "cesadmins@mmiholdings.co.za"',
    'git config user.name "multiply-service"',
    'git status',
    `git commit -a -m "${repositoryName}-release-$VERSION`,
    `git tag -a "${repositoryName}-tag-$VERSION" -m \"${repositoryName}-tag-$VERSION\"`,
    `git checkout -b "${repositoryName}-branch-$VERSION"`,
    'git push --all',
    'git push --tags',
    `git checkout ${branch}`,
  ];

  return commands;
};
