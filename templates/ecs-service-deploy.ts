import { CfnParameter, Construct, Stack, StackProps } from "@aws-cdk/core";

interface stackProps extends StackProps {}

export class EcsServiceDeploy extends Stack {
  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    const githubOrgParam = new CfnParameter(this, 'github-org', {
      type: 'String',
      description: 'Github organisation name',
      default: process.env.GITHUB_ORG ?? 'mmi-holdings-ces',
    });

    const sourceProviderParam = new CfnParameter(this, 'source-provider', {
      type: 'String',
      description: 'Pipeline source provider',
      default: process.env.SOURCE_PROVIDER ?? 'github',
      allowedValues: ['github', 'codecommit', 's3'],
    });

    const repositoryName: string = this.node.tryGetContext('repositoryName');

    if (!repositoryName) {
      throw Error('Expected context [repositoryName] to be defined.')
    }

  };
}