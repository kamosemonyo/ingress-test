import { deepStrictEqual } from "assert"
import { ACCOUNT_PRE, ENV_DEV, ENV_PROD, GITHUB_ORG } from "../lib/constants"
import { Shell } from "../lib/shell"
import { getServiceTagVersion } from "../lib/util"
import { kongDeployToK8s } from "../pipeline_stage/kong/kong-commands"

describe('Shell command tests', () => {
  it('Deploy ingress to K8s commands', () => {
    const expected = [
        `aws s3 sync s3://momentum-money-k8s-ingress-templates .ingress/`,
        `export version=$SNAPSHOT_VERSION`,
        `K8S_VERSION=$(echo \"$SNAPSHOT_VERSION\" | tr '[:upper:]' '[:lower:]'|  tr -d .)`,
        `export namespace=dev`,
        `export service=kong`,
        `export service_headless=kong-service-hl`,
        `export deployment=kong-$(echo $K8S_VERSION)`,
        `export path=kong`,
        `export docker_image=737245153745.dkr.ecr.eu-west-1.amazonaws.com/kong:$SNAPSHOT_VERSION`,
        `export env=dev`,
        `export hostname=test-host.com`,
        "envsubst < .ingress/deployment.yml > tmp.yml && mv tmp.yml .ingress/deployment.yml",
        "cat .ingress/deployment.yml",
        "envsubst < .ingress/service.yml > tmp.yml && mv tmp.yml .ingress/service.yml",
        `cat .ingress/service.yml`,
        "envsubst < .ingress/ingress.yml > tmp.yml && mv tmp.yml .ingress/ingress.yml",
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

  it('Deploy service to K8s commands', () => {
    const expected = [
        `aws s3 sync s3://momentum-money-k8s-templates .service/`,
        `export version=$SNAPSHOT_VERSION`,
        `K8S_VERSION=$(echo \"$SNAPSHOT_VERSION\" | tr '[:upper:]' '[:lower:]'|  tr -d .)`,
        `export namespace=dev`,
        `export service=kong`,
        `export service_headless=kong-service-hl`,
        `export deployment=kong-$(echo $K8S_VERSION)`,
        `export path=kong`,
        `export docker_image=737245153745.dkr.ecr.eu-west-1.amazonaws.com/kong:$SNAPSHOT_VERSION`,
        `export env=dev`,
        `export hostname=test-host.com`,
        "envsubst < .service/deployment.yml > tmp.yml && mv tmp.yml .service/deployment.yml",
        "cat .service/deployment.yml",
        "envsubst < .service/svc.yml > tmp.yml && mv tmp.yml .service/svc.yml",
        `cat .service/svc.yml`,
        "envsubst < .service/svc-headless.yml > tmp.yml && mv tmp.yml .service/svc-headless.yml",
        `cat .service/svc-headless.yml`,
        `OUT=$(aws sts assume-role --role-arn arn:aws:iam::737245153745:role/eks-deploy --role-session-name AWSCLI-Session)`,
        `export AWS_ACCESS_KEY_ID=$(echo $OUT | jq -r '.Credentials''.AccessKeyId')`,
        `export AWS_SECRET_ACCESS_KEY=$(echo $OUT | jq -r '.Credentials''.SecretAccessKey')`,
        `export AWS_SESSION_TOKEN=$(echo $OUT | jq -r '.Credentials''.SessionToken')`,
        `aws sts get-caller-identity`,
        `aws eks update-kubeconfig --name non-prod --region af-south-1`,
        `kubectl apply -f .service`
    ]

    const actual = Shell.eksDeployServiceToK8s({
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

  it('Docker dev image created correctly', () => {
    const expected = '737245153745.dkr.ecr.eu-west-1.amazonaws.com/kong:$SNAPSHOT_VERSION'
    const actual = Shell.toDockerImage(ACCOUNT_PRE, 'kong', getServiceTagVersion(ENV_DEV))

    deepStrictEqual(actual, expected)
  })

  it('Replace environment vars in file extensions work', () => {
      const expected = 'envsubst < test/path.yml > tmp.yml && mv tmp.yml test/path.yml'
      const actual = Shell.replaceEnvPlaceHolderValues('test/path.yml')
      deepStrictEqual(actual, expected)
  })
})