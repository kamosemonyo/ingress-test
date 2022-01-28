import { Template } from '@aws-cdk/assertions-alpha';
import { App } from 'aws-cdk-lib';

import { MavenServicePipeline } from '../templates/maven-service-pipeline';

import '@aws-cdk/assert/jest';

import { toValidConstructName } from '../lib/util';

const repositoryName = 'pfm-service';
const artifactsBucket = 'pipeline-artifacts';

test('Stack Snapshot', () => {
  const app = new App({ context: { repositoryName }});
  const stack = new MavenServicePipeline(app, toValidConstructName(repositoryName), {
    repositoryName,
    env: {
      account: '23456789111',
      region: 'af-south-1'
    }
  });
  app.synth();

  expect(Template.fromStack(stack)).toMatchSnapshot();
});

test('Throw error without repository context', () => {
  const synth = () => {
    const app = new App();
    const stack = new MavenServicePipeline(app, toValidConstructName(repositoryName), {
      repositoryName,
      env: {
        account: '23456789111',
        region: 'af-south-1'
      }
    });
    app.synth();
  };

  expect(synth).toThrow('Expected context [repositoryName] to be defined.');
});

test('Creates all required resources', () => {
  const app = new App({ context: { repositoryName }});
  const stack = new MavenServicePipeline(app, toValidConstructName(repositoryName), {
    repositoryName,
    env: {
      account: '23456789111',
      region: 'af-south-1'
    },
  });
  app.synth();

  // Creates Pipeline
  Template.fromStack(stack).hasResourceProperties('AWS::CodePipeline::Pipeline', {
    Name: {
      'Fn::Join': [
        '',
        [
          `${repositoryName}-`,
          {
            'Ref': 'branch'
          }
        ]
      ]
    },
    ArtifactStore: {
      Location: artifactsBucket,
      Type: 'S3'
    },
  });

  // Creates build CodeBuild project
  Template.fromStack(stack).hasResourceProperties('AWS::CodeBuild::Project', {
    Name: {
      'Fn::Join': [
        '',
        [
          `${repositoryName}-`,
          {
            'Ref': 'branch',
          },
          '-build',
        ],
      ],
    }
  });

  // Creates deploy CodeBuild project
  Template.fromStack(stack).hasResourceProperties('AWS::CodeBuild::Project', {
    Name: {
      'Fn::Join': [
        '',
        [
          `${repositoryName}-`,
          {
            'Ref': 'branch',
          },
          '-deploy',
        ],
      ],
    }
  });

  // Creates ECR repository
  Template.fromStack(stack).hasResourceProperties('AWS::ECR::Repository', {
    RepositoryName: repositoryName,
    ImageTagMutability: 'IMMUTABLE'
  });
});

test('Builds pipeline correctly', () => {
  process.env.SOURCE_BRANCH = 'develop';

  const app = new App({ context: { repositoryName }});
  const stack = new MavenServicePipeline(app, toValidConstructName(repositoryName), {
    repositoryName,
    env: {
      account: '23456789111',
      region: 'af-south-1'
    }
  });

  app.synth();

  Template.fromStack(stack).hasResourceProperties('AWS::CodePipeline::Pipeline', {
    Name: {
      'Fn::Join': [
        '',
        [
          `${repositoryName}-`,
          {
            'Ref': 'branch'
          }
        ]
      ]
    },
    Stages: [
      {
        Actions: [
          {
            ActionTypeId: {
              Category: 'Source',
              Provider: 'GitHub',
            },
            Configuration: {
              Repo: repositoryName,
              Branch: 'master',
              OAuthToken: '{{resolve:secretsmanager:github-mmi-holdings-ces-token:SecretString:::}}',
            },
            OutputArtifacts: [
              {
                Name: 'Artifact_Source_Github_Source'
              }
            ],
          }
        ],
        Name: 'Source'
      },
      {
        Actions: [
          {
            ActionTypeId: {
              Category: 'Approval',
              Provider: 'Manual',
            },
          }
        ],
        Name: 'Approve_Build'
      },
      {
        Actions: [
          {
            ActionTypeId: {
              Provider: 'CodeBuild',
            },
            InputArtifacts: [
              {
                Name: 'Artifact_Source_Github_Source'
              }
            ],
            Name: 'Maven_Docker_Build',
            OutputArtifacts: [
              {
                Name: 'Artifact_Build_Maven_Docker_Build'
              }
            ],
          }
        ],
        Name: 'Build'
      },
      {
        Actions: [
          {
            ActionTypeId: {
              Category: 'Approval',
              Provider: 'Manual',
            },
            Name: 'Approve',
          }
        ],
        Name: 'Approve_Deploy'
      },
      {
        Actions: [
          {
            ActionTypeId: {
              Provider: 'CodeBuild',
            },
            InputArtifacts: [
              {
                Name: 'Artifact_Build_Maven_Docker_Build'
              }
            ],
            Name: 'Ecs_Deploy',
          }
        ],
        Name: 'Deploy'
      }
    ]
  });

});
