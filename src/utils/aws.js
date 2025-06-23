import AWS from 'aws-sdk';
import { logger } from './logger.js';

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Initialize AWS services
const s3 = new AWS.S3();
const sqs = new AWS.SQS();
const lambda = new AWS.Lambda();

// Upload file to S3
export async function uploadToS3(file, key) {
  try {
    logger.info('Uploading file to S3', { key });

    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: file,
      ContentType: file.type,
      ACL: 'private'
    };

    const result = await s3.upload(params).promise();
    
    logger.info('File uploaded successfully', { key, location: result.Location });
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

    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: key
    };

    const result = await s3.getObject(params).promise();
    
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

    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: key
    };

    await s3.deleteObject(params).promise();
    
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

    const params = {
      MessageBody: JSON.stringify(message),
      QueueUrl: queueUrl
    };

    const result = await sqs.sendMessage(params).promise();
    
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

    const params = {
      FunctionName: functionName,
      Payload: JSON.stringify(payload)
    };

    const result = await lambda.invoke(params).promise();
    
    logger.info('Lambda function invoked', { functionName, statusCode: result.StatusCode });
    return JSON.parse(result.Payload);
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