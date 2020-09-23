# Serverless NodeJS sample work 

## About

This is the  Agents API, which utilises Serverless and AWS Lambda. 
## Frameworks

* [Serverless](https://github.com/serverless/serverless) >=1.11.0
* **Testing** [jest](https://facebook.github.io/jest/)


## AWS Setup

The user used to deploy this solution must have the following policies attached:

* AWSLambdaFullAccess
* AWSCloudFormationReadOnlyAccess

## Develop Environment Setup

```
npm -g install serverless

# Create a profile in ~/.aws/credentials:
sls config credentials --provider aws --key AKIA.... --secret keydata..... --profile agents-api-deploy

# Set profile and region for convenience:
export AWS_PROFILE=agents-api-deploy
export AWS_REGION=ap-southeast-2

# Verify connection is possible:
sls info

# Install dependencies
npm install

# To speed up deployments a bit, run modclean to reduce the size of node_modules
# Run this after any npm install task
node_modules/.bin/modclean
```

## Debugging

### Unit Tests

```bash
npm install -g jest
jest ./lib/api/adapter.test.js
jest ./lib/api/auth.test.js
```

**To-do:** 
More unit tests are required.

### Logs

Serverless has some functionality to view the logs for the AWS Lambda function. This is useful if you see an error.

#### Register function logs

```bash
serverless --function register logs
serverless --function story logs
serverless --function proposal logs
```

## Deployment

**Be careful to always specify correct stage and profile when deploying**

```bash
 npm install
 serverless deploy --stage dev function --function functionname
```

### Deploy all functions

```bash
serverless deploy --stage dev --profile agents-api-deploy
```

### Deploy individual functions

Use this in most cases as it is faster.

```bash
serverless deploy --stage dev --profile agents-api-deploy function --function functionname
```

### Troubleshooting deployments

If the profile specified on the CLI is ignored, try setting the AWS_PROFILE env var to the profile name.

If that doesn't work, set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars.

## How it was created

```bash
serverless create --template aws-nodejs --path agents-api
cd agents-api
vim serverless.yml
serverless config credentials --provider aws --key KEY --secret SECRET --profile agents
```

### Database tables

The following AWS DynamoDB tables are used by the API:

* agentsUsers
* agentsPhotos
* agentsstorys
* agentsProposals
* ha_listing (listings data parsed by our [REA XML parser](https://github.com/agents/reaxmlparser))

### Troubleshooting

If you have intermittent internet connection, try the following before deployment

```bash
export AWS_CLIENT_TIMEOUT=600000
```

### Environment variables

* PASSWORD_SECRET_SALT - Defines a secret encryption key to encrypt and decrypt passwords. If you change this all passwords will not work
* DYNAMODB_USERS_TABLE - Defines the users table in dynamo db
* DYNAMODB_PHOTOS_TABLE - Defines table to store photo metadata
* DYNAMODB_storyS_TABLE - Defines table to store storys metadata
* DYNAMODB_PROPOSALS_TABLE - Defines table to store proposals metadata
* DYNAMODB_SALES_HISTORY_TABLE - Defines the listings table
* SENDGRID_API_KEY - Defines the API key for sendgrid
* SLACK_WEBHOOK_URL - The webhook URL for Slack notifications
* AWS_S3_UPLOAD_KEY - Access key for AWS S3
* AWS_S3_UPLOAD_SECRET - Secret key for AWS S3 (to generate a one time upload token)
* AWS_S3_BUCKET - S3 Bucket for dropping images in
* AWS_S3_BUCKET_PROCESSED: S3 bucket where the resized and processed images end up
* IMAGES_ORIGIN_URL - Origin URL for images

## Generating passwords

```bash
node -e 'var crypto = require("crypto"); var process = require("process"); var password = crypto.createHmac("sha1", process.env.PASSWORD_SECRET_SALT).update("123456789").digest("hex"); console.log(password); '
```
