'use strict';

require('dotenv').config();

// Imports dependencies and sets up http server
const
    express = require('express'),
    bodyParser = require('body-parser'),
    axios = require('axios'),
    querystring = require('querystring'),
    // creates express http server
    app = express().use(bodyParser.json());

const stravaUrl = "https://strava-node-api-203308554831.us-central1.run.app"
const runawayUrl = "https://runaway-node-api-203308554831.us-central1.run.app"
const runawayRefeshTokensUrl = "https://runaway-node-api-203308554831.us-central1.run.app/refresh-tokens"

const clientID = process.env.STRAVA_CLIENT_ID;
const clientSecret = process.env.STRAVA_CLIENT_SECRET;

let accessToken = '';
let refreshToken = '';

// Add error handling helper
function handleError(error, res) {
    console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
    });

    if (error.response?.status === 401) {
        return res?.send('Authentication expired. Please login again at the home page.');
    }

    const errorMessage = error.response?.data?.message || error.message;
    return res?.send(`Error: ${errorMessage}`);
}

async function refreshAccessToken(athleteId) {
    try {
        if (!athleteId) {
            throw new Error('No athlete ID available for token refresh');
        }

        // First get new tokens from runaway service
        const runawayResponse = await axios.get(`${runawayRefeshTokensUrl}/${athleteId}`)
            .catch(error => {
                throw new Error(`Failed to fetch from runaway service: ${error.message}`);
            });

        console.log('Runaway response:', runawayResponse.data);

        const storedRefreshToken = runawayResponse.data.refresh_token;
        if (!storedRefreshToken) {
            throw new Error('No refresh token found in runaway service');
        }

        console.log('Stored refresh token:', storedRefreshToken);
        console.log('Client ID:', clientID);
        console.log('Client secret:', clientSecret);

        // Use the stored refresh token to get new access token from Strava
        const tokenResponse = await axios.post('https://www.strava.com/oauth/token', querystring.stringify({
            client_id: clientID,
            client_secret: clientSecret,
            refresh_token: storedRefreshToken,
            grant_type: 'refresh_token'
        })).catch(error => {
            throw new Error(`Strava token refresh failed: ${error.response?.data?.message || error.message}`);
        });

        console.log('Token response:', tokenResponse.data);

        accessToken = tokenResponse.data.access_token;
        refreshToken = tokenResponse.data.refresh_token;

        // Update the stored tokens in runaway service
        console.log('athleteId:', athleteId);

        await axios.post(`${runawayUrl}/tokens`, {
            user_id: athleteId,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: tokenResponse.data.expires_at
        }).catch(error => {
            console.error('Failed to update runaway service:', error.message);
            // Continue execution even if update fails
        });

        console.log('Token refreshed successfully');
        console.log('New access token:', accessToken);
        return accessToken;
    } catch (error) {
        console.error('Token refresh failed:', {
            error: error.message,
            athleteId
        });
        throw error;
    }
}

// Sets server port and logs message on success
app.listen(process.env.PORT || 8080, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook
app.post('/webhook', async (req, res) => {
    console.log("webhook event received!", req.query, req.body);

    if (req.body.aspect_type == 'create') {
        try {
            // Extract the activity ID and athlete ID from the request body
            const activityId = req.body.object_id;
            const athleteId = req.body.owner_id;;

            console.log('Activity ID:', activityId);
            console.log('Athlete ID:', athleteId);

            if (!activityId) {
                console.error('No activity ID found in webhook payload');
                return res.status(400).send('No activity ID found');
            }

            if (!athleteId) {
                console.error('No athlete ID found in webhook payload');
                return res.status(400).send('No athlete ID found');
            }

            // Get fresh access token
            const accessToken = await refreshAccessToken(athleteId);

            console.log('Access token:', accessToken);

            // Make authenticated GET request to Strava API
            let activityData;
            try {
                const stravaUrlWithTokenandActivity = `${stravaUrl}/activities/${athleteId}/${activityId}?access_token=${accessToken}`;
                console.log('Fetching activity from Strava:', stravaUrlWithTokenandActivity);

                const activityResponse = await axios.get(`${stravaUrl}/activities/${athleteId}/${activityId}`);
                activityData = activityResponse.data;
                console.log('Activity details:', activityData);
            } catch (error) {
                console.error('Failed to fetch activity:', error.message);
                handleError(error, res);
                return;
            }

            // Fetch athlete details
            let athleteData;
            try {
                const athleteResponse = await axios.get(`${stravaUrl}/athlete/${athleteId}`);
                athleteData = athleteResponse.data;
                console.log('Athlete details:', athleteData);
            } catch (error) {
                console.error('Failed to fetch athlete:', error.message);
                handleError(error, res);
                return;
            }

            // Fetch athlete stats
            let athleteStatsData;
            try {
                const athleteStatsResponse = await axios.get(`${stravaUrl}/athlete/stats/${athleteId}`);
                athleteStatsData = athleteStatsResponse.data;
                console.log('Athlete stats:', athleteStatsData);
            } catch (error) {
                console.error('Failed to fetch athlete stats:', error.message);
                handleError(error, res);
                return;
            }

            // Make POST requests to Runaway API
            try {
                const transformedActivityData = transformActivityData(athleteId, activityData);
                const transformedAthleteData = transformAthleteData(athleteId, athleteData);
                const transformedAthleteStatsData = transformAthleteStatsData(athleteId, athleteStatsData);
                const transformedMapData = transformMapData(activityData);

                await Promise.all([
                    axios.post(`${runawayUrl}/activities`, transformedActivityData),
                    axios.post(`${runawayUrl}/athletes/${athleteId}`, transformedAthleteData),
                    axios.post(`${runawayUrl}/athletes/${athleteId}/stats`, transformedAthleteStatsData),
                    axios.post(`${runawayUrl}/maps`, transformedMapData)
                ]);

                res.status(200).send('EVENT_RECEIVED');
            } catch (error) {
                console.error('Failed to save data to Runaway:', error.message);
                handleError(error, res);
                return;
            }
        } catch (error) {
            console.error('Error processing webhook:', error);
            handleError(error, res);
        }
    }
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {
    // Your verify token. Should be a random string.
    const VERIFY_TOKEN = "at8rQqYOpROWL6HNgEXiiXb6ky2dhWcu";
    // Parses the query params
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
        // Verifies that the mode and token sent are valid
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            // Responds with the challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.json({ "hub.challenge": challenge });
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
});

// create a function that gets the full bodu of the strava activity by the activity id
function transformActivityData(athleteId, record) {
    const transformedData = {
        external_id: record.id?.toString(),
        upload_id: record.upload_id,
        name: record.name,
        type: record.type == 'WeightTraining' ? 'Weight Training' : record.type,
        detail: record.description,
        distance: record.distance,
        moving_time: record.moving_time,
        elapsed_time: record.elapsed_time,
        high_elevation: record.elev_high,
        low_elevation: record.elev_low,
        total_elevation_gain: record.total_elevation_gain,
        start_date: record.start_date,
        start_date_local: record.start_date_local,
        time_zone: record.timezone,
        achievement_count: record.achievement_count || 0,
        kudos_count: record.kudos_count || 0,
        comment_count: record.comment_count || 0,
        athlete_count: record.athlete_count || 1,
        photo_count: record.photo_count || 0,
        total_photo_count: record.total_photo_count || 0,
        trainer: record.trainer || false,
        commute: record.commute || false,
        manual: record.manual || false,
        private: record.private || false,
        flagged: record.flagged || false,
        average_speed: record.average_speed,
        max_speed: record.max_speed,
        calories: record.calories,
        has_kudoed: record.has_kudoed || false,
        kilo_joules: record.kilojoules,
        average_power: record.average_watts,
        max_power: record.max_watts,
        device_watts: record.device_watts || false,
        has_heart_rate: record.has_heartrate || false,
        average_heart_rate: record.average_heartrate,
        max_heart_rate: record.max_heartrate,
        user_id: athleteId,
        map_id: record.map.id
    };

    // Convert any undefined values to null
    Object.keys(transformedData).forEach(key => {
        if (transformedData[key] === undefined) {
            transformedData[key] = null;
        }
    });

    return transformedData;
}

function transformAthleteData(athleteId, athleteData) {
    const transformedData = {
        user_id: athleteId,
        firstname: athleteData.firstname,
        lastname: athleteData.lastname,
        profile_medium: athleteData.profile_medium,
        profile: athleteData.profile,
        city: athleteData.city,
        state: athleteData.state,
        country: athleteData.country,
        premium: athleteData.premium,
        created_at: athleteData.created_at,
        friend_count: athleteData.friend_count,
        follower_count: athleteData.follower_count,
        mutual_friend_count: athleteData.mutual_friend_count,
        date_preference: athleteData.date_preference,
        ftp: athleteData.ftp,
        weight: athleteData.weight,
        avatar_url: athleteData.profile // Using profile as avatar_url since it's the highest quality image
    };

    // Convert any undefined values to null
    Object.keys(transformedData).forEach(key => {
        if (transformedData[key] === undefined) {
            transformedData[key] = null;
        }
    });

    return transformedData;
}

function transformAthleteStatsData(athleteId, athleteStatsData) {
    // Extract the relevant stats from all_run_totals
    const stats = athleteStatsData.all_run_totals || {};

    const transformedData = {
        user_id: athleteId,
        count: stats.count,
        distance: stats.distance,
        moving_time: stats.moving_time,
        elapsed_time: stats.elapsed_time,
        elevation_gain: stats.elevation_gain,
        achievement_count: stats.achievement_count
    };

    // Convert any undefined values to null
    Object.keys(transformedData).forEach(key => {
        if (transformedData[key] === undefined) {
            transformedData[key] = null;
        }
    });

    return transformedData;
}

function transformMapData(activityData) {
    const transformedData = {
        map_id: activityData.map.id,
        summary_polyline: activityData.map.polyline
    };

    // Convert any undefined values to null
    Object.keys(transformedData).forEach(key => {
        if (transformedData[key] === undefined) {
            transformedData[key] = null;
        }
    });

    return transformedData;
}