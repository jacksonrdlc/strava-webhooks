# Strava Webhooks Service

A Node.js service that handles Strava webhooks, processes activity data, and syncs it with a downstream service. This service acts as a bridge between Strava's webhook system and your application's data storage.

## Features

- Handles Strava webhook verification
- Processes activity updates in real-time
- Fetches detailed activity information
- Retrieves athlete profile and statistics
- Manages OAuth token refresh
- Transforms data for downstream service consumption

## Tech Stack

- **Runtime**: Node.js 16.x
- **Framework**: Express.js
- **HTTP Client**: Axios
- **Environment Variables**: dotenv
- **API Integration**: Strava API v3

## Prerequisites

- Node.js 16.x or higher
- npm (Node Package Manager)
- Strava API credentials (Client ID and Client Secret)
- Access to downstream service endpoints

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
PORT=8080  # Optional, defaults to 8080
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd strava-webhooks
```

2. Install dependencies:
```bash
npm install
```

## Running the Service

Start the service:
```bash
npm start
```

The service will start on port 8080 (or the port specified in your environment variables).

## API Endpoints

### POST /webhook
Handles incoming Strava webhook events for activity updates.

### GET /webhook
Handles Strava webhook verification.

## Downstream Dependencies

The service interacts with the following downstream services:

1. **Runaway API** (`https://runaway-node-api-203308554831.us-central1.run.app`)
   - Endpoints:
     - `/activities` - Activity data storage
     - `/athletes/{userId}` - Athlete profile storage
     - `/athletes/{userId}/stats` - Athlete statistics storage
     - `/refresh-tokens` - OAuth token management

2. **Strava API** (`https://www.strava.com/api/v3`)
   - Endpoints:
     - `/activities/{id}` - Activity details
     - `/athlete` - Athlete profile
     - `/athlete/stats` - Athlete statistics
     - `/oauth/token` - OAuth token refresh

## Data Transformation

The service transforms data between Strava's format and your application's schema for:

1. Activities
2. Athletes
3. Athlete Statistics

## Error Handling

- Comprehensive error handling for API calls
- Detailed error logging
- Proper HTTP status codes
- Authentication error handling

## Development

To modify the service:

1. Make changes to the code
2. Test the webhook locally using a tool like ngrok
3. Deploy to your hosting platform

## License

ISC 