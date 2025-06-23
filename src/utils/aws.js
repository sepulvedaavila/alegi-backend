import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { logger } from './logger.js';

// Configure AWS clients
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const cloudwatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Upload file to S3
export async function uploadToS3(file, key) {
  try {
    logger.info('Uploading file to S3', { key });

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: file,
      ContentType: file.type,
      ACL: 'private'
    });

    const result = await s3Client.send(command);
    
    logger.info('File uploaded successfully', { key });
    return result;
  } catch (error) {
    logger.error('Error uploading to S3', { error: error.message, key });
    throw error;
  }
}

// Download file from S3
export async function downloadFromS3(key) {
  try {
    logger.info('Downloading file from S3', { key });

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key
    });

    const result = await s3Client.send(command);
    
    logger.info('File downloaded successfully', { key });
    return result.Body;
  } catch (error) {
    logger.error('Error downloading from S3', { error: error.message, key });
    throw error;
  }
}

// Delete file from S3
export async function deleteFromS3(key) {
  try {
    logger.info('Deleting file from S3', { key });

    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key
    });

    await s3Client.send(command);
    
    logger.info('File deleted successfully', { key });
    return { success: true };
  } catch (error) {
    logger.error('Error deleting from S3', { error: error.message, key });
    throw error;
  }
}

// Send message to SQS
export async function sendToSQS(message, queueUrl = process.env.SQS_QUEUE_URL) {
  try {
    logger.info('Sending message to SQS', { queueUrl });

    const command = new SendMessageCommand({
      MessageBody: JSON.stringify(message),
      QueueUrl: queueUrl
    });

    const result = await sqsClient.send(command);
    
    logger.info('Message sent to SQS', { messageId: result.MessageId });
    return result;
  } catch (error) {
    logger.error('Error sending to SQS', { error: error.message });
    throw error;
  }
}

// Invoke Lambda function
export async function invokeLambda(functionName, payload) {
  try {
    logger.info('Invoking Lambda function', { functionName });

    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload)
    });

    const result = await lambdaClient.send(command);
    
    logger.info('Lambda function invoked', { functionName, statusCode: result.StatusCode });
    return JSON.parse(new TextDecoder().decode(result.Payload));
  } catch (error) {
    logger.error('Error invoking Lambda', { error: error.message, functionName });
    throw error;
  }
}

// Process document with Lambda
export async function processDocument(documentId, s3Key) {
  try {
    logger.info('Processing document with Lambda', { documentId, s3Key });

    const payload = {
      documentId,
      s3Key,
      bucket: process.env.S3_BUCKET
    };

    const result = await invokeLambda('alegi-document-processor', payload);
    
    logger.info('Document processing completed', { documentId, result });
    return result;
  } catch (error) {
    logger.error('Error processing document', { error: error.message, documentId });
    throw error;
  }
}