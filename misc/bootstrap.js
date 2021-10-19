const yaml = require('js-yaml');
const fs   = require('fs');
const { exec } = require("child_process");

try {
  const docs = yaml.load(fs.readFileSync('misc/projects.yml', 'utf8'));
  
  for (let doc of docs) {
    for(let branch of doc.branches) {
      exec(buildCdkDeployCmd(doc.name, doc.propertiesFilePath, doc.replicas, branch), (error, stdout, stderr) => {
        if (error) {
          console.error(`error [create pipeline]: ${error.message}`);
          return;
        }
        if (stderr) {
          console.stderr(`stderr [create pipeline]: ${stderr}`);
          return;
        }
        console.log(`stdout [create pipeline]: ${stdout}`);
      });
    }
  }
} catch (e) {
  console.log(`Failed to load projects required for bootstrap: ${e}`);
}

function buildCdkDeployCmd(repository, propertiesFilePath, replicas, branch) {
  return `cdk diff -c template=maven-service-pipeline \
  -c repositoryName=${repository} \
  --parameters propertiesFile=\"${propertiesFilePath}\" \
  --parameters branch=${branch} \
  --parameters replicas=${replicas} \
  --all
  `;
}