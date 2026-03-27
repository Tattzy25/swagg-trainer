import express from "express";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
// Import Express types correctly
import type { Request, Response } from "express";

// Enable debug logging to see what's happening
process.env.DEBUG = "mcp:*";

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "Echo",
  version: "1.0.0"
});

// Register our capabilities
server.resource(
  "echo",
  new ResourceTemplate("echo://{message}", { list: undefined }),
  async (uri, { message }) => ({
    contents: [{
      uri: uri.href,
      text: `Resource echo: ${message}`
    }]
  })
);

server.tool(
  "echo",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message}` }]
  })
);

server.prompt(
  "echo",
  { message: z.string() },
  ({ message }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please process this message: ${message}`
      }
    }]
  })
);

app.post('/mcp', async (req: Request, res: Response) => {
  try {
    // Log incoming request for debugging
    console.log('Received request:', JSON.stringify(req.body, null, 2));
    
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    
    res.on('close', () => {
      console.log('Request closed');
      transport.close();
    });
    
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  console.log('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST to interact with the MCP server. Follow README for details."
    },
    id: null
  }));
});

app.delete('/mcp', async (req: Request, res: Response) => {
  console.log('Received DELETE MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST to interact with the MCP server. Follow README for details."
    },
    id: null
  }));
});

// Start the server
const PORT = process.env.MCP_SERVER_PORT || 4000;
app.listen(PORT, () => {
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

// Base URL for the TatttyTrainer API
const API_URL = process.env.MCP_API_URL || "https://api.tatttytrainer.com";

// Helper function for making API requests
async function makeTatttyTrainerRequest<T>(url: string, options: RequestInit = {}): Promise<T | null> {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    // Add any other necessary headers here
  };

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making TatttyTrainer request:", error);
    return null;
  }
}

// Interfaces for request and response types
interface UploadImagesRequest {
  zipFile: File; // Assuming a File object for the zip file
  triggerWord: string;
  modelName: string;
}

interface TrainModelRequest {
  modelId: string;
}

interface GenerateTattooImageRequest {
  prompt: string;
  modelId: string;
}

interface SearchArtistsResponse {
  artists: Artist[];
}

interface Artist {
  name: string;
  id: string;
  // Add other artist properties as needed
}

interface SearchModelsResponse {
  models: Model[];
}

interface Model {
  id: string;
  name: string;
  // Add other model properties as needed
}

interface AddArtistRequest {
  name: string;
  // Add other artist properties as needed
}

interface AddModelRequest {
  modelName: string;
  // Add other model properties as needed
}

interface GetGalleryResponse {
  images: string[]; // Array of image URLs
}

interface HealthStatusResponse {
  status: string;
}

interface ServerStatsResponse {
  usageMetrics: any; // Define as needed
}

// Register tools with MCP server
// @ts-ignore
server.tool(
  "upload-images",
  "Upload zip folder of tattoo images with trigger word and model name",
  {
    zipFile: z.instanceof(File).describe("Zip file containing tattoo images"),
    triggerWord: z.string().describe("Trigger word for the model"),
    modelName: z.string().describe("Name of the model to train"),
  },
  async ({ zipFile, triggerWord, modelName }: UploadImagesRequest) => {
    const formData = new FormData();
    formData.append("zipFile", zipFile);
    formData.append("triggerWord", triggerWord);
    formData.append("modelName", modelName);

    const response = await makeTatttyTrainerRequest(`${API_URL}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response) {
      return { content: [{ type: "text", text: "Failed to upload images." }] };
    }

    return { content: [{ type: "text", text: "Images uploaded successfully." }] };
  },
);

// @ts-ignore
server.tool(
  "trigger-model-training",
  "Trigger model training via backend workflow",
  {
    modelId: z.string().describe("ID of the model to train"),
  },
  async ({ modelId }: TrainModelRequest) => {
    const response = await makeTatttyTrainerRequest(`${API_URL}/train`, {
      method: "POST",
      body: JSON.stringify({ modelId }),
    });

    if (!response) {
      return { content: [{ type: "text", text: "Failed to trigger model training." }] };
    }

    return { content: [{ type: "text", text: "Model training triggered successfully." }] };
  },
);

// @ts-ignore
server.tool(
  "generate-tattoo-image",
  "Generate tattoo image from prompt using a trained model",
  {
    prompt: z.string().describe("Prompt for generating tattoo image"),
    modelId: z.string().describe("ID of the trained model"),
  },
  async ({ prompt, modelId }: GenerateTattooImageRequest) => {
    const response = await makeTatttyTrainerRequest<{ imageUrls: string[] }>(`${API_URL}/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt, modelId }),
    });

    if (!response) {
      return { content: [{ type: "text", text: "Failed to generate tattoo image." }] };
    }

    return { content: [{ type: "text", text: "Tattoo image generated successfully.", imageUrls: response.imageUrls }] };
  },
);

// @ts-ignore
server.tool(
  "search-artists",
  "Search tattoo artists by name",
  {
    name: z.string().describe("Name of the tattoo artist"),
  },
  async ({ name }: { name: string }) => {
    const response = await makeTatttyTrainerRequest<SearchArtistsResponse>(`${API_URL}/search/artists?name=${encodeURIComponent(name)}`);

    if (!response) {
      return { content: [{ type: "text", text: "Failed to search for artists." }] };
    }

    return { content: [{ type: "text", text: `Found artists: ${response.artists.map(artist => artist.name).join(", ")}` }] };
  },
);

// @ts-ignore
server.tool(
  "search-models",
  "Search models by name",
  {
    name: z.string().describe("Name of the model"),
  },
  async ({ name }: { name: string }) => {
    const response = await makeTatttyTrainerRequest<SearchModelsResponse>(`${API_URL}/search/models?name=${encodeURIComponent(name)}`);

    if (!response) {
      return { content: [{ type: "text", text: "Failed to search for models." }] };
    }

    return { content: [{ type: "text", text: `Found models: ${response.models.map(model => model.name).join(", ")}` }] };
  },
);

// @ts-ignore
server.tool(
  "add-artist",
  "Add a new tattoo artist",
  {
    name: z.string().describe("Name of the tattoo artist"),
  },
  async ({ name }: AddArtistRequest) => {
    const response = await makeTatttyTrainerRequest(`${API_URL}/artists`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    if (!response) {
      return { content: [{ type: "text", text: "Failed to add artist." }] };
    }

    return { content: [{ type: "text", text: "Artist added successfully." }] };
  },
);

// @ts-ignore
server.tool(
  "delete-artist",
  "Delete a tattoo artist by name",
  {
    artistName: z.string().describe("Name of the tattoo artist to delete"),
  },
  async ({ artistName }: { artistName: string }) => {
    const response = await makeTatttyTrainerRequest(`${API_URL}/artists/${encodeURIComponent(artistName)}`, {
      method: "DELETE",
    });

    if (!response) {
      return { content: [{ type: "text", text: "Failed to delete artist." }] };
    }

    return { content: [{ type: "text", text: "Artist deleted successfully." }] };
  },
);

// @ts-ignore
server.tool(
  "add-model",
  "Add a new trained model",
  {
    modelName: z.string().describe("Name of the trained model"),
  },
  async ({ modelName }: AddModelRequest) => {
    const response = await makeTatttyTrainerRequest(`${API_URL}/models`, {
      method: "POST",
      body: JSON.stringify({ modelName }),
    });

    if (!response) {
      return { content: [{ type: "text", text: "Failed to add model." }] };
    }

    return { content: [{ type: "text", text: "Model added successfully." }] };
  },
);

// @ts-ignore
server.tool(
  "delete-model",
  "Delete a trained model by ID",
  {
    modelId: z.string().describe("ID of the model to delete"),
  },
  async ({ modelId }: { modelId: string }) => {
    const response = await makeTatttyTrainerRequest(`${API_URL}/models/${encodeURIComponent(modelId)}`, {
      method: "DELETE",
    });

    if (!response) {
      return { content: [{ type: "text", text: "Failed to delete model." }] };
    }

    return { content: [{ type: "text", text: "Model deleted successfully." }] };
  },
);

// @ts-ignore
server.tool(
  "get-versions",
  "Get API versions",
  {},
  async () => {
    const response = await makeTatttyTrainerRequest<{ versions: string[] }>(`${API_URL}/versions`);

    if (!response) {
      return { content: [{ type: "text", text: "Failed to retrieve API versions." }] };
    }

    return { content: [{ type: "text", text: `Available API versions: ${response.versions.join(", ")}` }] };
  },
);

// @ts-ignore
server.tool(
  "get-artist-gallery",
  "Get gallery images for a tattoo artist",
  {
    artistName: z.string().describe("Name of the tattoo artist"),
  },
  async ({ artistName }: { artistName: string }) => {
    const response = await makeTatttyTrainerRequest<GetGalleryResponse>(`${API_URL}/gallery/${encodeURIComponent(artistName)}`);

    if (!response) {
      return { content: [{ type: "text", text: "Failed to retrieve artist gallery." }] };
    }

    return { content: [{ type: "text", text: `Gallery images: ${response.images.join(", ")}` }] };
  },
);

// @ts-ignore
server.tool(
  "get-health-status",
  "Get health status of the API",
  {},
  async () => {
    const response = await makeTatttyTrainerRequest<HealthStatusResponse>(`${API_URL}/health`);

    if (!response) {
      return { content: [{ type: "text", text: "Failed to retrieve health status." }] };
    }

    return { content: [{ type: "text", text: `API Health Status: ${response.status}` }] };
  },
);

// @ts-ignore
server.tool(
  "get-server-stats",
  "Get server statistics",
  {},
  async () => {
    const response = await makeTatttyTrainerRequest<ServerStatsResponse>(`${API_URL}/stats`);

    if (!response) {
      return { content: [{ type: "text", text: "Failed to retrieve server statistics." }] };
    }

    return { content: [{ type: "text", text: `Server Statistics: ${JSON.stringify(response.usageMetrics)}` }] };
  },
);