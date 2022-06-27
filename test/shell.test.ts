import { deepStrictEqual } from "assert"
import { ACCOUNT_PRE, ENV_DEV, ENV_PROD, GITHUB_ORG } from "../lib/constants"
import { Shell } from "../lib/shell"
import { getServiceTagVersion } from "../lib/util"
import { kongDeployToK8s } from "../pipeline_stage/kong/kong-commands"

describe('Shell command tests', () => {
  it('Deploy to K8s commands', () => {
    const expected = [
        `aws s3 sync s3://momentum-money-k8s-ingress-templates .ingress/`,
        `namespace=dev`,
        `service=kong`,
        `service-headless=kong-service-hl`,
        `deployment=kong-$(echo $SNAPSHOT_VERSION)`,
        `path=kong`,
        `docker_image=737245153745.dkr.ecr.eu-west-1.amazonaws.com/kong:$SNAPSHOT_VERSION`,
        `hostname=test-host.com`,
        `eval "echo \\"$(cat .ingress/deployment.yml)\\"" > .ingress/deployment.yml`,
        `cat .ingress/deployment.yml`,
        `eval "echo \\"$(cat .ingress/service.yml)\\"" > .ingress/service.yml`,
        `cat .ingress/service.yml`,
        `eval "echo \\"$(cat .ingress/ingress.yml)\\"" > .ingress/ingress.yml`,
        `cat .ingress/ingress.yml`,
        `OUT=$(aws sts assume-role --role-arn arn:aws:iam::737245153745:role/eks-deploy --role-session-name AWSCLI-Session)`,
        `export AWS_ACCESS_KEY_ID=$(echo $OUT | jq -r '.Credentials''.AccessKeyId')`,
        `export AWS_SECRET_ACCESS_KEY=$(echo $OUT | jq -r '.Credentials''.SecretAccessKey')`,
        `export AWS_SESSION_TOKEN=$(echo $OUT | jq -r '.Credentials''.SessionToken')`,
        `aws sts get-caller-identity`,
        `aws eks update-kubeconfig --name non-prod --region af-south-1`,
        `kubectl apply -f .ingress`
    ]

    const actual = kongDeployToK8s({
      account: ACCOUNT_PRE,
      environment: ENV_DEV,
      githubOrgName: GITHUB_ORG,
      propertiesFilePath: 'test/path',
      repositoryName: 'kong',
      host: 'test-host.com',
      replicas: 1
    })

    deepStrictEqual(actual, expected)
  })

  it('Docker prod image created correctly', () => {
    const expected = '737245153745.dkr.ecr.eu-west-1.amazonaws.com/kong:$VERSION'
    const actual = Shell.toDockerImage(ACCOUNT_PRE, 'kong', getServiceTagVersion(ENV_PROD))

    deepStrictEqual(actual, expected)
  })

  it('Docker dev image created correctly', () => {
    const expected = '737245153745.dkr.ecr.eu-west-1.amazonaws.com/kong:$SNAPSHOT_VERSION'
    const actual = Shell.toDockerImage(ACCOUNT_PRE, 'kong', getServiceTagVersion(ENV_DEV))

    deepStrictEqual(actual, expected)
  })
})