class MrdaGame {
    constructor(apiGame) {
        this.date = apiGame.date;
        this.homeTeamId = apiGame.homeTeamId;
        this.awayTeamId = apiGame.awayTeamId;
        this.scores = {};
        this.scores[this.homeTeamId] = apiGame.homeTeamScore;
        this.scores[this.awayTeamId] = apiGame.awayTeamScore;        
        this.forfeit = apiGame.forfeit;
        this.eventName = apiGame.eventName;
        this.championship = apiGame.championship;
        this.qualifier = apiGame.qualifier;
        this.expectedRatios = {};
        this.rankingPoints = {};
    }
}

class MrdaTeam {
    constructor(apiTeam) {
        this.teamId = apiTeam.teamId;
        this.teamName = apiTeam.teamName;
        this.distanceClauseApplies = apiTeam.distanceClauseApplies;
        this.gameHistory = []
        this.activeStatusGameCount = 0;
        this.rankingPoints = 0;
        this.rankingPointsHistory = new Map();
        this.ranking = null;
        this.rankingSort = null;
        this.postseasonEligible = false;
        this.chart = false;
    }

    getRankingPointHistory(date) {
        if (this.rankingPointsHistory.size === 0)
            return;

        let searchDate = new Date(date);
        let oldest = new Date(this.rankingPointsHistory.keys().next().value);

        if (isNaN(oldest) || searchDate < oldest)
            return;

        while(!this.rankingPointsHistory.has(getStandardDateString(searchDate)) ) {
            searchDate.setDate(searchDate.getDate() - 1);
        }
        return this.rankingPointsHistory.get(getStandardDateString(searchDate))
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

// Define the number of milliseconds in one day
const dayInMilliseconds = 1000 * 60 * 60 * 24;

function daysDiff(startDate, endDate) {
    
    // Convert to dates and remove time
    let dateStart = new Date(new Date(startDate).toDateString());
    let dateEnd = new Date(new Date(endDate).toDateString());
    
    // Calculate the difference in milliseconds
    let diffInMilliseconds = dateEnd.getTime() - dateStart.getTime();

    // Calculate the number of days and round to the nearest whole number
    return Math.round(diffInMilliseconds / dayInMilliseconds);;
}

class MrdaLinearRegressionSystem {
    constructor(apiTeams) {
        this.mrdaTeams = {};
        Object.keys(apiTeams).forEach(teamId => this.mrdaTeams[teamId] = new MrdaTeam(apiTeams[teamId]));
        this.absoluteLogErrors = [];
    }

    updateRankings(linear_regression_rankings, calcDate) {
        for (const [date, rankings] of Object.entries(linear_regression_rankings)) {
            if (daysDiff(date,calcDate) >= 0) {
                for (const [team, rank] of Object.entries(rankings)) {
                    if (this.mrdaTeams[team].rankingPoints != rank) {
                        this.mrdaTeams[team].rankingPointsHistory.set(date, rank);
                        this.mrdaTeams[team].rankingPoints = rank;
                    }
                }
            }
        }
    }

    addGameHistory(groupedApiGames, calcDate) {
        let groupedGames = [...groupedApiGames.values()];
        groupedGames.forEach(gameGroup => {
            gameGroup.forEach(apiGame => {
                if (daysDiff(apiGame.date, calcDate) > 0)
                {
                    let mrdaGame = new MrdaGame(apiGame);
                    let homeTeam = this.mrdaTeams[mrdaGame.homeTeamId];
                    let awayTeam = this.mrdaTeams[mrdaGame.awayTeamId];
                    let homeRankingPoints = homeTeam.getRankingPointHistory(mrdaGame.date);
                    let awayRankingPoints = awayTeam.getRankingPointHistory(mrdaGame.date);
                    if (homeRankingPoints && awayRankingPoints && !mrdaGame.forfeit) {
                        let homeExpectedRatio = homeRankingPoints/awayRankingPoints;
                        let awayExpectedRatio = awayRankingPoints/homeRankingPoints;
                        let homeActualRatio = mrdaGame.scores[mrdaGame.homeTeamId]/mrdaGame.scores[mrdaGame.awayTeamId];
                        let awayActualRatio = mrdaGame.scores[mrdaGame.awayTeamId]/mrdaGame.scores[mrdaGame.homeTeamId];
                        mrdaGame.rankingPoints[mrdaGame.homeTeamId] = homeRankingPoints * ratioCap(homeActualRatio)/ratioCap(homeExpectedRatio);
                        mrdaGame.rankingPoints[mrdaGame.awayTeamId] = awayRankingPoints * ratioCap(awayActualRatio)/ratioCap(awayExpectedRatio);

                        if (new Date(mrdaGame.date).getFullYear() == 2025) {
                            this.absoluteLogErrors.push(Math.abs(Math.log(homeExpectedRatio/homeActualRatio)));
                        }
                    }
                    homeTeam.gameHistory.push(mrdaGame);
                    awayTeam.gameHistory.push(mrdaGame);
                }
            });
        });
    }

    calculateActiveStatus(calcDate) {
        Object.values(this.mrdaTeams).forEach(team => {
            team.gameHistory.forEach(game => {
                let ageDays = daysDiff(game.date, calcDate);
                if (ageDays < 0 || ageDays >= 365)
                    return;
                if (game.championship && ageDays >= 183) {
                    //championships do not count for active status past 6 months
                    return
                } else if (game.qualifier && ageDays >= 271) {
                    //qualifiers do not count for active status past 9 months
                    return;
                } else if (game.forfeit 
                    && ((game.scores[game.homeTeamId] > 0 && game.homeTeamId == team.teamId) 
                    || (game.scores[game.awayTeamId] > 0 && game.awayTeamId == team.teamId))) {
                    team.activeStatusGameCount ++;
                } else {
                    team.activeStatusGameCount ++;
                }
            });
        });
    }

    rankTeams() {
        let eligibleForRankingTeams = [];
        let unrankedTeams = [];
        Object.values(this.mrdaTeams).forEach(team => {
            if (team.activeStatusGameCount >= 3) {
                eligibleForRankingTeams.push(team);
            } else {
                unrankedTeams.push(team);
            }
        });

        let sortedTeams = eligibleForRankingTeams.sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedTeams.length; i++) {
            let team = sortedTeams[i];
            team.ranking = i + 1;
            team.rankingSort = i + 1;

            if (team.ranking < 6)
                team.chart = true;

            if (team.activeStatusGameCount >= 5 || team.distanceClauseApplies)
                team.postseasonEligible = true;
        }

        let sortedUnrankedTeams = unrankedTeams.sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedUnrankedTeams.length; i++) {
            let team = sortedUnrankedTeams[i];
            team.rankingSort = sortedTeams.length + i + 1;
        }
    }
}
