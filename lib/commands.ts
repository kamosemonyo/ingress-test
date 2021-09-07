export class CommonCommands {
  static installCdkCmd: string[] = [
    'echo "Installing AWS CDK"',
    'npm install -g aws-cdk typescript',
    'cdk --version',
  ];

  static debugEnvCmd = [
    'env',
    'ls -al',
  ];
};
