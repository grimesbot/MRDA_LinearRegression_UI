class MrdaGame {
    constructor(game) {
        this.date = game.date;
        this.homeTeamId = game.home_team_id;
        this.awayTeamId = game.away_team_id;
        this.scores = {};
        this.scores[this.homeTeamId] = game.home_team_score;
        this.scores[this.awayTeamId] = game.away_team_score;        
        this.forfeit = game.forfeit;
        this.eventName = game.event_name;
        this.championship = this.eventName && this.eventName.includes('Mens Roller Derby Association Championships');
        this.qualifier = this.eventName && this.eventName.includes('Qualifiers');
        this.expectedDifferentials = {};        
        this.rankingPoints = {};
    }
}

class MrdaTeam {
    constructor(teamId, team) {
        this.teamId = teamId;
        this.teamName = team.name;
        this.region = team.region;
        this.gameHistory = []
        this.activeStatus = false;
        this.activeStatusGameCount = 0;
        this.activeUniqueOpponents = [];        
        this.rankingPoints = 0;
        this.stdErr = 0;        
        this.rankingPointsHistory = new Map();
        this.stdErrMinHistory = new Map();
        this.stdErrMaxHistory = new Map();
        this.stdErrHistory = new Map();
        this.rank = null;
        this.rankSort = null;
        this.postseasonEligible = false;
        this.chart = false;
    }

    getRankingPointHistory(date) {
        if (this.rankingPointsHistory.size === 0)
            return;

        // Start search from most recent Wednesday on or before date
        let searchDate = new Date(date);
        searchDate.setDate(searchDate.getDate() - ((searchDate.getDay() - 3 + 7) % 7));

        let oldest = new Date(this.rankingPointsHistory.keys().next().value + " 00:00:00");

        if (isNaN(oldest) || searchDate < oldest)
            return;

        while(!this.rankingPointsHistory.has(getStandardDateString(searchDate)) ) {
            searchDate.setDate(searchDate.getDate() - 7);
        }
        return this.rankingPointsHistory.get(getStandardDateString(searchDate))
    }

    getRankingPointHistoryWithError(date, addWeek = false) {
        let searchDate = new Date(date);

        if (addWeek)
            searchDate.setDate(searchDate.getDate() + 7);

        let rp = this.getRankingPointHistory(searchDate);
        if (!rp)
            return rp;

        if (this.stdErrHistory.size === 0)
            return rp.toFixed(2);
        
        let oldest = new Date(this.stdErrHistory.keys().next().value + " 00:00:00");

        if (isNaN(oldest) || searchDate < oldest)
            return;

        while(!this.stdErrHistory.has(getStandardDateString(searchDate)) ) {
            searchDate.setDate(searchDate.getDate() - 1);
        }

        let stdErr = this.stdErrHistory.get(getStandardDateString(searchDate));

        return rp.toFixed(2) + " ± " + stdErr;
    }
}

function getStandardDateString(date) {
    let dt = new Date(date);
    return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

const q4_2024_deadline = new Date (2024, 12 - 1, 4);
const q1_2025_deadline = new Date (2025, 3 - 1, 5);
const q2_2025_deadline = new Date (2025, 6 - 1, 4);
const q3_2025_deadline = new Date (2025, 9 - 1, 3);

class MrdaLinearRegressionSystem {
    constructor(teams) {
        this.mrdaTeams = {};
        Object.keys(teams).forEach(teamId => this.mrdaTeams[teamId] = new MrdaTeam(teamId, teams[teamId]));
        this.absoluteLogErrors = [];    
        this.absoluteLogErrors_2025_Q1 = [];
        this.absoluteLogErrors_2025_Q2 = [];
        this.absoluteLogErrors_2025_Q3 = [];
    }

    updateRankings(rankings_history, calcDate) {
        let calcDt = new Date(calcDate + " 00:00:00");
        for (const [date, rankings] of Object.entries(rankings_history)) {
            let rankingDt = new Date(date + " 00:00:00");
            if (rankingDt <= calcDt) {
                Object.values(this.mrdaTeams).forEach(team => {
                    let rankingPoints = team.teamId in rankings ? rankings[team.teamId].rp : 0;
                    let stdErr = team.teamId in rankings ? rankings[team.teamId].se : 0;                    
                    let gameCount = team.teamId in rankings ? rankings[team.teamId].gc : 0;
                    let activeStatus = team.teamId in rankings ? rankings[team.teamId].as == 1 : false;
                    let postseasonEligible = team.teamId in rankings ? rankings[team.teamId].pe == 1 : false;
                    if (team.rankingPoints != rankingPoints
                        || team.stdErr != stdErr
                        || team.activeStatusGameCount != gameCount                        
                        || team.activeStatus != activeStatus
                        || team.postseasonEligible != postseasonEligible) {
                        team.rankingPoints = rankingPoints;
                        team.stdErr = stdErr;
                        team.rankingPointsHistory.set(date, rankingPoints);
                        team.stdErrHistory.set(date, stdErr);
                        team.stdErrMinHistory.set(date, (rankingPoints - stdErr));
                        team.stdErrMaxHistory.set(date, (rankingPoints + stdErr));
                        team.activeStatusGameCount = gameCount;
                        team.activeStatus = activeStatus;
                        team.postseasonEligible = postseasonEligible
                    }
                });
            }
        }
    }

    addGameHistory(games, calcDate) {
        let calcDt = new Date(calcDate + " 00:00:00");
        games.forEach(game => {
            let gameDt = new Date(game.date);
            if (gameDt < calcDt)
            {
                let mrdaGame = new MrdaGame(game);
                let homeTeam = this.mrdaTeams[mrdaGame.homeTeamId];
                let awayTeam = this.mrdaTeams[mrdaGame.awayTeamId];
                let homeRankingPoints = homeTeam.getRankingPointHistory(mrdaGame.date);
                let awayRankingPoints = awayTeam.getRankingPointHistory(mrdaGame.date);
                if (homeRankingPoints && awayRankingPoints && !mrdaGame.forfeit) {
                    mrdaGame.expectedDifferentials[mrdaGame.homeTeamId] = homeRankingPoints - awayRankingPoints;
                    mrdaGame.expectedDifferentials[mrdaGame.awayTeamId] = awayRankingPoints - homeRankingPoints;
                    mrdaGame.rankingPoints[mrdaGame.homeTeamId] = homeRankingPoints + (mrdaGame.scores[mrdaGame.homeTeamId] - mrdaGame.scores[mrdaGame.awayTeamId]) - mrdaGame.expectedDifferentials[mrdaGame.homeTeamId];
                    mrdaGame.rankingPoints[mrdaGame.awayTeamId] = awayRankingPoints + (mrdaGame.scores[mrdaGame.awayTeamId] - mrdaGame.scores[mrdaGame.homeTeamId]) - mrdaGame.expectedDifferentials[mrdaGame.awayTeamId];
                }
                homeTeam.gameHistory.push(mrdaGame);
                awayTeam.gameHistory.push(mrdaGame);
                }
            });
    }

    rankTeams(region) {
        let sortedActiveTeams = Object.values(this.mrdaTeams).filter(team => team.activeStatus && (team.region == region || region == "GUR"))
                                                        .sort((a, b) => b.rankingPoints - a.rankingPoints );

        let sortedInactiveTeams = Object.values(this.mrdaTeams).filter(team => !team.activeStatus && (team.region == region || region == "GUR"))
                                                        .sort((a, b) => b.rankingPoints - a.rankingPoints );
        
        for (let i = 0; i < sortedActiveTeams.length; i++) {
            let team = sortedActiveTeams[i];
            team.rank = i + 1;
            team.rankSort = i + 1;

            if (team.rank <= 5)
                team.chart = true;
        }

        for (let i = 0; i < sortedInactiveTeams.length; i++) {
            let team = sortedInactiveTeams[i];
            team.rankSort = sortedActiveTeams.length + i + 1;
        }
    }
}
