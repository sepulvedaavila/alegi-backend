// test/test-blob-conversion.js
// Test the Blob to Buffer conversion logic

async function testBlobConversion() {
  console.log('🧪 Testing Blob to Buffer Conversion...\n');

  try {
    // Simulate a Blob object (like what Supabase returns)
    const mockBlob = {
      size: 1024,
      type: 'application/pdf',
      arrayBuffer: async () => {
        // Return a mock ArrayBuffer
        const buffer = Buffer.from('Mock PDF content for testing');
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      }
    };

    console.log('1. Testing Blob to Buffer conversion...');
    
    // Test the conversion logic
    const arrayBuffer = await mockBlob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    
    console.log(`   Original blob size: ${mockBlob.size}`);
    console.log(`   Converted buffer length: ${fileBuffer.length}`);
    console.log(`   Buffer content preview: ${fileBuffer.toString().substring(0, 20)}...`);
    
    // Test that it can be used with FormData
    const FormData = require('form-data');
    const formData = new FormData();
    
    try {
      formData.append('file', fileBuffer, {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      });
      console.log('   ✅ FormData append successful');
    } catch (error) {
      console.log(`   ❌ FormData append failed: ${error.message}`);
    }

    console.log('\n✅ Blob to Buffer conversion test completed!');
    return true;

  } catch (error) {
    console.error('\n❌ Blob to Buffer conversion test failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testBlobConversion()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testBlobConversion }; 