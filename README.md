# Welcome to your CDK TypeScript project!

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template

 ## Importing the multiply.money certificate into AWS

**Important the command will import the certificate into the default account you configured**

 1. Request the certificate PEM from I&O network security team
 2. Copy the certificate body into the certificate/certificate_body.pem
 3. Copy the certificate key into the certificate/certificate_private_key.pem
 4. Make the import_certificate.sh file executable
 4. Run import_certificate.sh file import the certificate into aws
 5. Copy the certificate ARN from the terminal and paste it into the development_templates/kong-templates/ingress.yml

Make the file executable
```cmd
chmod +x import_certificate.sh
```

Execute the file
```cmd
./import_certificate.sh
```

```yml
metadata:
  annotations:
    alb.ingress.kubernetes.io/certificate-arn: <aws-certificate-arn>
```