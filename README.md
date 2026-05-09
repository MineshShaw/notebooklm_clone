# NotebookLM-style RAG Application

A production-quality Retrieval-Augmented Generation (RAG) application built with Next.js, Express, and Pinecone. Upload PDF or TXT documents, chunk and embed them, then ask grounded questions with answers sourced only from your selected documents.

## Features

- 📤 **File Upload**: Drag & drop or select PDF/TXT files
- 🤖 **RAG-Powered Chat**: Ask questions grounded in your documents
- 📌 **Multi-Document Support**: Select which files to include in answers
- 🔗 **Source Citations**: See retrieved chunks and their sources
- 💾 **Persistent Storage**: Files persist via localStorage
- 🎨 **Modern UI**: Clean, responsive interface with Tailwind CSS
- 🚀 **Free Stack**: Uses Groq (free LLM) and HuggingFace embeddings

## Tech Stack

### Frontend
- **Framework**: Next.js 16 with App Router
- **UI**: React 19 + Tailwind CSS
- **API Client**: Axios
- **State**: React Hooks + localStorage

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Vector DB**: Pinecone
- **Embeddings**: HuggingFace (sentence-transformers/all-MiniLM-L6-v2) via Transformers.js
- **LLM**: Groq (llama-3.3-70b-versatile)
- **Document Parsing**: pdf-parse
- **File Upload**: Multer
- **Chunking**: LangChain RecursiveCharacterTextSplitter

## Prerequisites

- **Node.js** 20+
- **npm** or **yarn**
- **Groq API Key** (free tier available at https://console.groq.com)
- **Pinecone Account** (free tier available at https://www.pinecone.io)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Clone or extract the project
cd notebooklm_clone

# Install backend dependencies
cd server
npm install

# Install frontend dependencies (in another terminal)
cd client
npm install
```

### 2. Configure Environment Variables

#### Backend Setup (`server/.env`)

Create `server/.env` with the following variables:

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
PINECONE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PINECONE_INDEX_NAME=notebooklm-rag
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
PORT=3001
```

**How to get these keys:**

1. **Groq API Key**:
   - Go to https://console.groq.com
   - Sign up for free
   - Navigate to API Keys
   - Copy your API key

2. **Pinecone Setup**:
   - Go to https://www.pinecone.io
   - Sign up for free
   - Create a new organization
   - In your dashboard, get your API Key
   - Choose your preferred cloud (AWS recommended)
   - Choose a region (us-east-1 recommended)

#### Frontend Setup (`client/.env.local`)

Create `client/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

### 3. Start the Application

You need **two terminal windows**:

**Terminal 1 — Backend API**

```bash
cd server
npm run dev
```

Expected output:
```
Pinecone index ready...
API listening on http://localhost:3001
```

**Terminal 2 — Frontend**

```bash
cd client
npm run dev
```

Expected output:
```
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 4. Open the Application

Visit `http://localhost:3000` in your browser.

## How to Use

1. **Upload Documents**:
   - Drag & drop PDF or TXT files onto the upload zone
   - Or click "Choose file" to select
   - Wait for "Upload complete" confirmation

2. **Select Documents**:
   - Uploaded files appear in the left sidebar
   - Check the checkbox to include them in answers
   - Use "Select all" or "Clear all" buttons for batch operations

3. **Ask Questions**:
   - Type a question in the chat input
   - Press Enter or click the Send button
   - The AI will search your documents and provide an answer

4. **View Sources**:
   - Each response includes a "Sources" section
   - Click to expand and see the exact chunks used
   - Verify answers are grounded in your documents

5. **Manage Files**:
   - Click the trash icon to remove a single file
   - Click "Clear all" to remove all files
   - Files sync between browser sessions (localStorage)

## API Endpoints

### Upload a File
```json
POST /api/upload
Content-Type: multipart/form-data

file: <binary PDF or TXT>

Response:
{
  "fileId": "uuid",
  "fileName": "document.pdf",
  "uploadDate": "2024-01-15T10:30:00Z",
  "chunkCount": 42
}
```

### Chat with Documents
```json
POST /api/chat
Content-Type: application/json

{
  "message": "What is this about?",
  "selectedFileIds": ["uuid1", "uuid2"]
}

Response:
{
  "answer": "Based on the documents...",
  "sources": [
    {
      "fileId": "uuid1",
      "fileName": "document.pdf",
      "chunkIndex": 5,
      "text": "...",
      "score": 0.87
    }
  ]
}
```

### List Uploaded Files
```json
GET /api/files

Response:
{
  "files": [
    {
      "fileId": "uuid",
      "fileName": "document.pdf",
      "uploadDate": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Delete a File
```json
DELETE /api/files/:fileId

Response:
{
  "ok": true,
  "fileId": "uuid"
}
```

## Architecture

```
┌─────────────┐
│  Browser    │
│  (Next.js)  │
└────────┬────┘
         │ HTTP/REST
         ▼
┌─────────────────────┐
│ Express Backend     │
│  - File Upload      │
│  - Chat Logic       │
│  - Pinecone Client  │
└────────┬────────────┘
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
┌────────┐  ┌───────────┐
│  File  │  │ Pinecone  │
│Storage │  │ (Vectors) │
└────────┘  └─────┬─────┘
                  │
                  ▼
            ┌──────────────┐
            │ Embeddings   │
            │ (HuggingFace)│
            └──────────────┘
                  │
                  ▼
            ┌──────────────┐
            │   Groq LLM   │
            │  (Chat)      │
            └──────────────┘
```

## Document Processing

1. **Upload**: File sent to backend via Multer
2. **Extract**: PDF/TXT text extracted
3. **Chunk**: Text split into 500-char chunks with 100-char overlap
4. **Embed**: Chunks converted to 384-dim embeddings (all-MiniLM-L6-v2)
5. **Store**: Embeddings upserted to Pinecone with metadata
6. **Query**: User questions embedded and searched against stored vectors
7. **Generate**: Retrieved context sent to Groq for grounded response

## API routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Multipart field `file` — PDF or TXT |
| `POST` | `/api/chat` | JSON `{ message, selectedFileIds }` |
| `GET` | `/api/files` | Uploaded file metadata (server-side registry) |
| `DELETE` | `/api/files/:fileId` | Remove local file, metadata, and Pinecone vectors for `fileId` |

## Project layout

- `client/` — Next.js App Router, Tailwind, `localStorage` for file list + active selections
- `server/` — Express, Multer, LangChain text splitting, OpenAI embeddings/chat, Pinecone
