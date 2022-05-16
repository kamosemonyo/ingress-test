import { nexusRepository, NEXUS_PASSWORD_SSM_KEY, NEXUS_USERNAME_SSM_KEY } from "./constants";

const GH_VERSION = '2.4.0';
const KUBECTL_VERSION = '1.15.0';
const YQ_VERSION = 'v4.25.1';
const YQ_BINARY = 'yq_linux_amd64'
const CLUSTER_REPO = 'aws-eks';
const CLUSTER_YML_CONFIG_PATH = 'cluster/services.yml';

export class CommonCommands {
  static installCdkCmd: string[] = [
    'echo "Installing AWS CDK"',
    'npm install -g aws-cdk@1.122.0 typescript',
    'cdk --version',
  ];

  static installJq: string[] = [
    'echo "Installing Jq"',
    'apt-get update',
    'apt install jq',
    'apt install gettext',
  ];

  static debugEnvCmd = [
    'env',
    'ls -al',
  ];

  static setupMvnSettings = (region: string):string[] => [
    `mkdir -p ~/.m2`,
    `export NEXUS_REPOSITORY=${nexusRepository}`,
    `export NEXUS_USERNAME=$(aws ssm get-parameter --name "${NEXUS_USERNAME_SSM_KEY}" --region ${region} --output json | jq -r '.[].Value')`,
    `export NEXUS_PASSWORD=$(aws ssm get-parameter --name "${NEXUS_PASSWORD_SSM_KEY}" --with-decryption --region ${region} --output json | jq -r '.[].Value')`,
    `echo \" ${getMvnSettingsTemplate()}\" > ~/.m2/settings.tmpl.xml`,
    `envsubst < ~/.m2/settings.tmpl.xml > ~/.m2/settings.xml`,
  ];

  static installGithubCLI = ():string[] => [
    `echo \"Installing Github CLI v${GH_VERSION} in $PWD/bin\"`,
    `mkdir -p bin`,
    `curl -LO https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz`,
    `tar -xzf gh_${GH_VERSION}_linux_amd64.tar.gz`,
    `mv gh_${GH_VERSION}_linux_amd64/bin/gh bin/`
  ];  

  static installKubectl = ():string[] => [
    `echo \"Installing Kubectl v${KUBECTL_VERSION} in $PWD/bin\"`,
    `mkdir -p bin`,
    `curl -L https://storage.googleapis.com/kubernetes-release/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl -o bin/kubectl`,
    `chmod +x bin/kubectl`
  ];

  static installYq = ():string[] => [
    `echo "Installing Yq v${YQ_VERSION}"`,
    'sudo apt update',
    `wget https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/${YQ_BINARY} -O /usr/bin/yq`,
    `chmod +x /usr/bin/yq`,
    'yq --version',
    'yq --help'
  ];

  static updateCluster = (repo:string , env:string, githubOrg:string):string[] => [
    `git clone https://$GITHUB_AUTH_TOKEN@github.com/${githubOrg}/${CLUSTER_REPO}.git .crepo`,
    `cd .crepo`,
    'git config user.email \"cesadmins@mmiholdings.co.za\"',
    'git config user.name \"multiply-service\"',
    'git fetch',
    `git switch ${env}`,
    'git pull',
    `VERSION=$VERSION yq -i '.services.[] |= select(.repo == "${repo}").version= env(VERSION)' ${CLUSTER_YML_CONFIG_PATH}`,
    `git commit -am "update ${repo} to version $VERSION"`,
    `git tag -a ${repo}-$VERSION -m "update ${repo} to version $VERSION" `,
    'git push',
    'git push origin --tags',
    'rm -rf .crepo'
  ]
};

const getMvnSettingsTemplate = (): string => {
return `
<settings>
  <servers>
    <server>
      <id>nexus</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>momentum</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-central</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-thirdparty</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-releases</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
    <server>
      <id>nexus-momentum-snapshots</id>
      <username>$NEXUS_USERNAME</username>
      <password>$NEXUS_PASSWORD</password>
    </server>
  </servers>

  <profiles>
    <profile>
        <id>nexus</id>
        <repositories>
            <repository>
              <id>maven-public</id>
              <url>$NEXUS_REPOSITORY/repository/maven-public</url>
              <releases><enabled>true</enabled></releases>
              <snapshots><enabled>true</enabled></snapshots>
            </repository>
        </repositories>
        <pluginRepositories>
            <pluginRepository>
                <id>maven-public</id>
                <url>$NEXUS_REPOSITORY/repository/maven-public</url>
                <releases><enabled>true</enabled></releases>
                <snapshots><enabled>true</enabled></snapshots>
            </pluginRepository>
        </pluginRepositories>
    </profile>
  </profiles>
  <activeProfiles>
    <activeProfile>nexus</activeProfile>
  </activeProfiles>
</settings>
`
};

