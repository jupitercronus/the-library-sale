// api/upc.js - New Vercel Serverless Function for UPC Lookups

// This function acts as a secure proxy to the upcitemdb.com API.
// It prevents exposing API keys on the client-side and bypasses CORS issues.
module.exports = async (req, res) => {
    // Set CORS headers to allow requests from your app's domain.
    // For development, '*' is okay, but for production, you should restrict this
    // to your actual domain, e.g., 'https://your-app-name.vercel.app'.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    // Handle preflight OPTIONS requests for CORS.
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    // Ensure this function only handles GET requests.
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  
    // Extract the 'upc' code from the query string of the request URL.
    // Example request: /api/upc?upc=123456789012
    const { upc } = req.query;
  
    // Validate that a UPC was provided.
    if (!upc) {
      return res.status(400).json({ error: 'UPC code is required.' });
    }
  
    // The base URL for the UPC Item DB API (trial version).
    const UPC_API_URL = `https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`;
  
    try {
      console.log(`Proxying request for UPC: ${upc} to ${UPC_API_URL}`);
  
      // Use fetch to make the request to the external UPC API.
      const apiResponse = await fetch(UPC_API_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          // It's good practice to set a User-Agent.
          'User-Agent': 'the-library-sale-App/1.0' 
        }
      });
  
      // Check if the request to the external API was successful.
      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`UPC API returned an error: ${apiResponse.status}`);
        // Forward the error status and message to the client.
        return res.status(apiResponse.status).json({
          error: `UPC API Error: ${apiResponse.statusText}`,
          details: errorText
        });
      }
  
      // Parse the JSON response from the UPC API.
      const data = await apiResponse.json();
      
      console.log(`Successfully fetched data for UPC: ${upc}`);
      // Send the successful response back to the client.
      res.status(200).json(data);
  
    } catch (error) {
      // Handle any network errors or other exceptions during the fetch.
      console.error('Error proxying UPC request:', error);
      res.status(500).json({
        error: 'Failed to proxy request to UPC API.',
        details: error.message
      });
    }
  };
