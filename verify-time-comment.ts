// Verify time analysis comments
const testAPI = async () => {
    const body = {
        year: '2026',
        date: '0104',
        place: '中山',
        raceNumber: '1',
        useAI: false,
        trackCondition: '良'
    };

    try {
        console.log('Fetching analysis...');
        const res = await fetch('http://localhost:3001/api/saga-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            console.error('Error status:', res.status);
            return;
        }

        const data = await res.json();
        console.log('Success:', data.success);

        if (data.analyses) {
            console.log('\n=== Time Evaluation Comments ===');
            let found = false;
            data.analyses.forEach((h: any) => {
                // timeEvaluationフィールド、またはcomments内のタイム関連コメントを探す
                if (h.timeEvaluation) {
                    console.log(`[${h.horseNumber} ${h.horseName}] Evaluation: ${h.timeEvaluation}`);
                    found = true;
                }

                // 詳細コメントもチェック
                const timeComments = h.comments?.filter((c: string) => c.includes('時計') || c.includes('タイム') || c.includes('上回る') || c.includes('遅い'));
                if (timeComments && timeComments.length > 0) {
                    console.log(`[${h.horseNumber} ${h.horseName}] Comments: ${timeComments.join(' / ')}`);
                    found = true;
                }
            });

            if (!found) {
                console.log('No time evaluation comments found.');
            }
        }

    } catch (err) {
        console.error('Fetch error:', err);
    }
};

testAPI();
