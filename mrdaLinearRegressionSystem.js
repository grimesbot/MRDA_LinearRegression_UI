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
        this.expectedRatios = {};        
        this.rankingPoints = {};
    }
}

class MrdaTeam {
    constructor(teamId, team) {
        this.teamId = teamId;
        this.teamName = team.name;
        this.distanceClauseApplies = team.distance_clause_applies;
        this.gameHistory = []
        this.activeStatusGameCount = 0;
        this.activeUniqueOpponents = [];        
        this.rankingPoints = 0;
        this.relStdErr = 0;        
        this.rankingPointsHistory = new Map();
        this.stdErrMinHistory = new Map();
        this.stdErrMaxHistory = new Map();
        this.relStdErrHistory = new Map();
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

        if (this.relStdErrHistory.size === 0)
            return rp.toFixed(2);
        
        let oldest = new Date(this.relStdErrHistory.keys().next().value + " 00:00:00");

        if (isNaN(oldest) || searchDate < oldest)
            return;

        while(!this.relStdErrHistory.has(getStandardDateString(searchDate)) ) {
            searchDate.setDate(searchDate.getDate() - 1);
        }

        let relStdErr = this.relStdErrHistory.get(getStandardDateString(searchDate));

        return rp.toFixed(2) + " ± " + relStdErr.toFixed(2) + "%";
    }
}

function ratioCap(ratio) {
    let ratioCap = 4;
    if (!ratioCap)
        return ratio;
    if (ratio > ratioCap)
        return ratioCap;
    if (ratio < 1/ratioCap)
        return 1/ratioCap;
    return ratio;
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
                for (const [team, rank] of Object.entries(rankings)) {
                    this.mrdaTeams[team].rankingPoints = rank.rp;
                    this.mrdaTeams[team].relStdErr = rank.rse;
                    this.mrdaTeams[team].rankingPointsHistory.set(date, rank.rp);
                    this.mrdaTeams[team].relStdErrHistory.set(date, rank.rse);
                    this.mrdaTeams[team].stdErrMinHistory.set(date, (rank.rp - rank.se));
                    this.mrdaTeams[team].stdErrMaxHistory.set(date, (rank.rp + rank.se));
                }
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
                    mrdaGame.expectedRatios[mrdaGame.homeTeamId] = homeRankingPoints/awayRankingPoints;
                    mrdaGame.expectedRatios[mrdaGame.awayTeamId] = awayRankingPoints/homeRankingPoints;
                    let homeActualRatio = mrdaGame.scores[mrdaGame.homeTeamId]/mrdaGame.scores[mrdaGame.awayTeamId];
                    let awayActualRatio = mrdaGame.scores[mrdaGame.awayTeamId]/mrdaGame.scores[mrdaGame.homeTeamId];
                    mrdaGame.rankingPoints[mrdaGame.homeTeamId] = homeRankingPoints * ratioCap(homeActualRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.homeTeamId]);
                    mrdaGame.rankingPoints[mrdaGame.awayTeamId] = awayRankingPoints * ratioCap(awayActualRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.awayTeamId]);

                    if (gameDt > q4_2024_deadline) {
                        let absLogError = Math.abs(Math.log(mrdaGame.expectedRatios[mrdaGame.homeTeamId]/homeActualRatio));
                        this.absoluteLogErrors.push(absLogError);       
                        if (q4_2024_deadline < gameDt && gameDt < q1_2025_deadline)
                            this.absoluteLogErrors_2025_Q1.push(absLogError);
                        if (q1_2025_deadline < gameDt && gameDt < q2_2025_deadline)
                            this.absoluteLogErrors_2025_Q2.push(absLogError);
                        if (q2_2025_deadline < gameDt && gameDt < q3_2025_deadline)
                            this.absoluteLogErrors_2025_Q3.push(absLogError);
                    }
                }
                homeTeam.gameHistory.push(mrdaGame);
                awayTeam.gameHistory.push(mrdaGame);
                }
            });
    }

    calculateActiveStatus(calcDate) {
        let calcDt = new Date(calcDate + " 00:00:00");

        let minDt = new Date(calcDate);
        minDt.setDate(minDt.getDate() - 7 * 52);

        // If minDt is a greater # weekday of month than calcDt, set minDt back an additional week
        // e.g. if calcDt is 1st Wednesday of June, minDt should be 1st Wednesday of June last year.
        // calcDt = Jun 7, 2028, 52 weeks prior would minDt = Jun 9, 2027 which is 2nd Wednesday of June.
        // set minDt back an additional week minDt = Jun 2, 2027 so games on weekend of Jun 4-6, 2027 count
        if (Math.floor((minDt.getDate() - 1) / 7) > Math.floor((calcDt.getDate() - 1) / 7))
            minDt.setDate(minDt.getDate() - 7);
        
        let champsDecayDt = new Date(calcDt);
        champsDecayDt.setMonth(champsDecayDt.getMonth() - 6);

        let qualDecayDt = new Date(calcDt);
        qualDecayDt.setMonth(qualDecayDt.getMonth() - 9);        

        Object.values(this.mrdaTeams).forEach(team => {
            team.gameHistory.forEach(game => {
                let gameDt = new Date (game.date);
                
                if (gameDt < minDt || gameDt >= calcDt)
                    return;
                if (game.championship) {
                    //championships do not count for active status past 6 months
                    if (gameDt < champsDecayDt)
                        return;
                }
                if (game.qualifier) {
                    //qualifiers do not count for active status past 9 months
                    if (gameDt < qualDecayDt)
                        return;
                }

                if (game.forfeit 
                    && (game.homeTeamId == team.teamId && game.scores[game.homeTeamId] == 0)
                    || (game.awayTeamId == team.teamId && game.scores[game.awayTeamId] == 0))
                    return;

                team.activeStatusGameCount ++;
                if (game.homeTeamId == team.teamId && !team.activeUniqueOpponents.includes(game.awayTeamId))
                    team.activeUniqueOpponents.push(game.awayTeamId);
                if (game.awayTeamId == team.teamId && !team.activeUniqueOpponents.includes(game.homeTeamId))
                    team.activeUniqueOpponents.push(game.homeTeamId);
            });
        });
    }

    rankTeams() {
        let eligibleForRankingTeams = [];
        let unrankedTeams = [];
        Object.values(this.mrdaTeams).forEach(team => {
            if (team.activeStatusGameCount >= 3 && team.activeUniqueOpponents.length >= 2) {
                eligibleForRankingTeams.push(team);
            } else {
                unrankedTeams.push(team);
            }
        });

        let sortedTeams = eligibleForRankingTeams.sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedTeams.length; i++) {
            let team = sortedTeams[i];
            team.rank = i + 1;
            team.rankSort = i + 1;

            if (team.rank < 6)
                team.chart = true;

            if (team.activeStatusGameCount >= 5 || team.distanceClauseApplies)
                team.postseasonEligible = true;
        }

        let sortedUnrankedTeams = unrankedTeams.sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedUnrankedTeams.length; i++) {
            let team = sortedUnrankedTeams[i];
            team.rankSort = sortedTeams.length + i + 1;
        }
    }
}
