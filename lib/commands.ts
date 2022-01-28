import { nexusRepository, NEXUS_PASSWORD_SSM_KEY, NEXUS_USERNAME_SSM_KEY } from "./constants";

const GH_VERSION = '2.4.0';
const KUBECTL_VERSION = '1.15.0';
const YQ_VERSION = '4.17.2';

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

  static setupMvnSettings = (region: string) => setupMvnSettings(region);
  static installGithubCLI = () => installGithubCLI();
  static installKubectl = () => installKubectl();
  static installYq = () => installYq();
};

const setupMvnSettings = (region: string): string[] => [
  `mkdir -p ~/.m2`,
  `export NEXUS_REPOSITORY=${nexusRepository}`,
  `export NEXUS_USERNAME=$(aws ssm get-parameter --name "${NEXUS_USERNAME_SSM_KEY}" --region ${region} --output json | jq -r '.[].Value')`,
  `export NEXUS_PASSWORD=$(aws ssm get-parameter --name "${NEXUS_PASSWORD_SSM_KEY}" --with-decryption --region ${region} --output json | jq -r '.[].Value')`,
  `echo \" ${getMvnSettingsTemplate()}\" > ~/.m2/settings.tmpl.xml`,
  `envsubst < ~/.m2/settings.tmpl.xml > ~/.m2/settings.xml`,
];

const installGithubCLI = (): string[] => [
  `echo \"Installing Github CLI v${GH_VERSION} in $PWD/bin\"`,
  `mkdir -p bin`,
  `curl -LO https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz`,
  `tar -xzf gh_${GH_VERSION}_linux_amd64.tar.gz`,
  `mv gh_${GH_VERSION}_linux_amd64/bin/gh bin/`
];

const installKubectl = (): string[] => [
  `echo \"Installing Kubectl v${KUBECTL_VERSION} in $PWD/bin\"`,
  `mkdir -p bin`,
  `curl -L https://storage.googleapis.com/kubernetes-release/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl -o bin/kubectl`,
  `chmod +x bin/kubectl`
];

const installYq = (): string[] => [
  `echo \"Installing Yq v${YQ_VERSION} in $PWD/bin\"`,
  `mkdir -p bin`,
  `curl -L https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64 -o bin/yq`,
  'chmod +x bin/yq',
  'chmod +x bin/yq --version',
]

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
