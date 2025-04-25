// Provider Registry for Goose Web Simple UI
// Based on the desktop app's ProviderRegistry.tsx

export const PROVIDER_REGISTRY = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Access GPT-4, GPT-3.5 Turbo, and other OpenAI models',
    parameters: [
      {
        name: 'OPENAI_API_KEY',
        is_secret: true,
        required: true,
        label: 'API Key'
      },
      {
        name: 'OPENAI_HOST',
        is_secret: false,
        default: 'https://api.openai.com',
        label: 'Host'
      },
      {
        name: 'OPENAI_BASE_PATH',
        is_secret: false,
        default: 'v1/chat/completions',
        label: 'Base Path'
      }
    ],
    defaultModel: 'gpt-4o',
    knownModels: [
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo'
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Access Claude and other Anthropic models',
    parameters: [
      {
        name: 'ANTHROPIC_API_KEY',
        is_secret: true,
        required: true,
        label: 'API Key'
      },
      {
        name: 'ANTHROPIC_HOST',
        is_secret: false,
        default: 'https://api.anthropic.com',
        label: 'Host'
      }
    ],
    defaultModel: 'claude-3-5-sonnet',
    knownModels: [
      'claude-3-5-sonnet',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku'
    ]
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Access Gemini and other Google AI models',
    parameters: [
      {
        name: 'GOOGLE_API_KEY',
        is_secret: true,
        required: true,
        label: 'API Key'
      }
    ],
    defaultModel: 'gemini-1.5-pro',
    knownModels: [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.0-pro'
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Access Mixtral and other Groq-hosted models',
    parameters: [
      {
        name: 'GROQ_API_KEY',
        is_secret: true,
        required: true,
        label: 'API Key'
      }
    ],
    defaultModel: 'llama3-70b-8192',
    knownModels: [
      'llama3-70b-8192',
      'llama3-8b-8192',
      'mixtral-8x7b-32768',
      'gemma-7b-it'
    ]
  },
  {
    id: 'databricks',
    name: 'Databricks',
    description: 'Access models hosted on your Databricks instance',
    parameters: [
      {
        name: 'DATABRICKS_HOST',
        is_secret: false,
        required: true,
        label: 'Host'
      }
    ],
    defaultModel: 'databricks-dbrx-instruct',
    knownModels: [
      'databricks-dbrx-instruct'
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access a variety of AI models through OpenRouter',
    parameters: [
      {
        name: 'OPENROUTER_API_KEY',
        is_secret: true,
        required: true,
        label: 'API Key'
      }
    ],
    defaultModel: 'openai/gpt-4o',
    knownModels: [
      'openai/gpt-4o',
      'anthropic/claude-3-5-sonnet',
      'meta-llama/llama-3-70b-instruct',
      'google/gemini-1.5-pro'
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run and use open-source models locally',
    parameters: [
      {
        name: 'OLLAMA_HOST',
        is_secret: false,
        default: 'http://localhost:11434',
        required: true,
        label: 'Host URL'
      }
    ],
    defaultModel: 'qwen2.5-coder:3b',
    knownModels: [
      'qwen2.5-coder:3b',
      'llama3:8b',
      'llama3:70b',
      'mistral:7b',
      'mixtral:8x7b',
      'codellama:7b',
      'phi3:14b'
    ]
  },
  {
    id: 'azure_openai',
    name: 'Azure OpenAI',
    description: 'Access Azure OpenAI models',
    parameters: [
      {
        name: 'AZURE_OPENAI_API_KEY',
        is_secret: true,
        required: true,
        label: 'API Key'
      },
      {
        name: 'AZURE_OPENAI_ENDPOINT',
        is_secret: false,
        required: true,
        label: 'Endpoint'
      },
      {
        name: 'AZURE_OPENAI_DEPLOYMENT_NAME',
        is_secret: false,
        required: true,
        label: 'Deployment Name'
      },
      {
        name: 'AZURE_OPENAI_API_VERSION',
        is_secret: false,
        default: '2024-10-21',
        label: 'API Version'
      }
    ],
    defaultModel: 'gpt-4',
    knownModels: [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-35-turbo'
    ]
  },
  {
    id: 'gcp_vertex_ai',
    name: 'GCP Vertex AI',
    description: 'GCP Vertex AI models',
    parameters: [
      {
        name: 'GCP_PROJECT_ID',
        is_secret: false,
        required: true,
        label: 'Project ID'
      },
      {
        name: 'GCP_LOCATION',
        is_secret: false,
        default: 'us-central1',
        label: 'Location'
      }
    ],
    defaultModel: 'gemini-1.5-pro',
    knownModels: [
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ]
  }
];

// Helper function to get provider by ID
export function getProviderById(id) {
  return PROVIDER_REGISTRY.find(provider => provider.id === id) || null;
}

// Helper function to get all provider IDs and names for dropdown
export function getProviderOptions() {
  return PROVIDER_REGISTRY.map(provider => ({
    id: provider.id,
    name: provider.name
  }));
}