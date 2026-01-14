// APIのテスト用スクリプト
const fetch = require('node-fetch');

async function testAPI() {
    try {
        // 1. 日付一覧の取得
        console.log('1. 日付一覧の取得');
        const datesRes = await fetch('http://localhost:3000/api/races');
        const datesData = await datesRes.json();
        console.log('日付一覧:', datesData.dates?.slice(0, 5));
        
        // 2. 特定日付のvenues取得
        console.log('\n2. 特定日付のvenues取得 (date=1227)');
        const venuesRes = await fetch('http://localhost:3000/api/races?date=1227');
        const venuesData = await venuesRes.json();
        console.log('venues:', JSON.stringify(venuesData.venues?.slice(0, 1), null, 2));
        
        // 3. レースカードの取得
        if (venuesData.venues && venuesData.venues.length > 0) {
            const firstVenue = venuesData.venues[0];
            if (firstVenue.races && firstVenue.races.length > 0) {
                const firstRace = firstVenue.races[0];
                console.log(`\n3. レースカードの取得 (date=1227, place=${firstVenue.place}, raceNumber=${firstRace.race_number})`);
                const raceCardRes = await fetch(`http://localhost:3000/api/race-card-with-score?date=1227&place=${encodeURIComponent(firstVenue.place)}&raceNumber=${firstRace.race_number}`);
                const raceCardData = await raceCardRes.json();
                console.log('レースカード:', {
                    success: raceCardRes.ok,
                    status: raceCardRes.status,
                    horsesCount: raceCardData.horses?.length || 0,
                    error: raceCardData.error
                });
            }
        }
    } catch (err) {
        console.error('エラー:', err.message);
    }
}

testAPI();


















