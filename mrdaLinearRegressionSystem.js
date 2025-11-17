class MrdaGame {
    constructor(game) {
        this.date = game.date;
        this.homeTeamId = game.home_team_id;
        this.awayTeamId = game.away_team_id;
        this.scores = {};
        this.scores[this.homeTeamId] = game.home_team_score;
        this.scores[this.awayTeamId] = game.away_team_score;
        this.forfeit = game.forfeit;
        this.forfeit_team_id = game.forfeit_team_id;
        this.event_name = game.event_name;
        this.sanctioning_id = game.sanctioning_id;
        this.championship = this.event_name && this.event_name.includes('Mens Roller Derby Association Championships');
        this.qualifier = this.event_name && this.event_name.includes('Qualifiers');
        this.expectedRatios = {};
        this.rankingPoints = {};
    }
}

class MrdaTeam {
    constructor(teamId, team) {
        this.teamId = teamId;
        this.teamName = team.name;
        this.region = team.region;
        this.location = team.location;
        this.logo = team.logo && team.logo.startsWith("/central/") ? "https://assets.mrda.org" + team.logo : team.logo;
        this.gameHistory = []
        this.activeStatus = false;
        this.activeStatusGameCount = 0;
        this.wins = 0;
        this.losses = 0;
        this.forfeits = 0;
        this.rankingPoints = 0;
        this.relStdErr = 0;
        this.rankingPointsHistory = new Map();
        this.stdErrMinHistory = new Map();
        this.stdErrMaxHistory = new Map();
        this.relStdErrHistory = new Map();
        this.rank = null;
        this.regionRank = null;        
        this.postseasonEligible = false;
        this.postseasonPosition = null;
        this.chart = false;
    }

    getRankingPointHistory(date, addWeek=false) {
        if (this.rankingPointsHistory.size === 0)
            return;

        // Start search from most recent Wednesday on or before date
        let searchDate = new Date(date);
        searchDate.setDate(searchDate.getDate() - ((searchDate.getDay() - 3 + 7) % 7));

        if (addWeek)
            searchDate.setDate(searchDate.getDate() + 7);

        let oldest = new Date(this.rankingPointsHistory.keys().next().value + " 00:00:00");

        if (isNaN(oldest) || searchDate < oldest)
            return;

        while(!this.rankingPointsHistory.has(getStandardDateString(searchDate)) ) {
            searchDate.setDate(searchDate.getDate() - 7);
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

const regions = ['EUR', 'AA', 'AM'];

class MrdaLinearRegressionSystem {
    constructor(teams, rankingPeriodDeadlineDt, rankingPeriodStartDt, region) {
        this.mrdaTeams = {};
        Object.keys(teams).forEach(teamId => this.mrdaTeams[teamId] = new MrdaTeam(teamId, teams[teamId]));
        this.rankingPeriodDeadlineDt = rankingPeriodDeadlineDt;
        this.rankingPeriodStartDt = rankingPeriodStartDt;
        this.region = region;
    }

    updateRankings(rankings_history) {
        for (const [date, rankings] of Object.entries(rankings_history)) {
            let rankingDt = new Date(date + " 00:00:00");
            if (rankingDt <= rankingPeriodDeadlineDt) {
                Object.values(this.mrdaTeams).forEach(team => {
                    let rankingPoints = team.teamId in rankings ? rankings[team.teamId].rp : 0;
                    let stdErr = team.teamId in rankings ? rankings[team.teamId].se : 0;
                    let relStdErr = team.teamId in rankings ? rankings[team.teamId].rse : 0;
                    let gameCount = team.teamId in rankings ? rankings[team.teamId].gc : 0;
                    let activeStatus = team.teamId in rankings ? rankings[team.teamId].as == 1 : false;
                    let postseasonEligible = team.teamId in rankings ? rankings[team.teamId].pe == 1 : false;
                    if (team.rankingPoints != rankingPoints
                        || team.relStdErr != relStdErr
                        || team.activeStatusGameCount != gameCount
                        || team.activeStatus != activeStatus
                        || team.postseasonEligible != postseasonEligible) {
                        team.rankingPoints = rankingPoints;
                        team.relStdErr = relStdErr;
                        team.rankingPointsHistory.set(date, rankingPoints);
                        team.relStdErrHistory.set(date, relStdErr);
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

    addGameHistory(games) {
        games.forEach(game => {
            let gameDt = new Date(game.date);
            if (gameDt < this.rankingPeriodDeadlineDt)
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
                }

                if (gameDt >= this.rankingPeriodStartDt) {
                    if (mrdaGame.forfeit) {
                        if (mrdaGame.forfeit_team_id == mrdaGame.homeTeamId)
                            homeTeam.forfeits += 1;
                        else if (mrdaGame.forfeit_team_id == mrdaGame.awayTeamId)
                            awayTeam.forfeits += 1;
                    } else {
                        if (mrdaGame.scores[mrdaGame.homeTeamId] > mrdaGame.scores[mrdaGame.awayTeamId]) {
                            homeTeam.wins++;
                            awayTeam.losses++;
                        } else {
                            awayTeam.wins++;
                            homeTeam.losses++;
                        }
                    }
                }

                homeTeam.gameHistory.push(mrdaGame);
                awayTeam.gameHistory.push(mrdaGame);
            }
        });
    }

    rankTeams() {

        // Rank the active teams
        let sortedActiveTeams = Object.values(this.mrdaTeams).filter(team => team.activeStatus)
                                    .sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedActiveTeams.length; i++) {
            let team = sortedActiveTeams[i];
            team.rank = i + 1;

            if (this.region == "GUR" && team.rank <= 5)
                team.chart = true;
        }

        let forfeitAsterisk = $('#forfeitAsterisk');
        forfeitAsterisk.hide();
        // Handle forfeits and 2 ranking spot penalty
        Object.values(this.mrdaTeams).filter(team => team.activeStatus && team.forfeits > 0).forEach(team => {
            // Each forfeit gets penalty
            for (let i = 0; i < team.forfeits; i++) {
                // Try to swap with next team twice
                for (let j = 0; j < 2; j++) {
                    let swapTeam = Object.values(this.mrdaTeams).find(t => t.rank == (team.rank + 1));
                    if (swapTeam) {
                        swapTeam.rank -= 1;
                        team.rank += 1;
                        forfeitAsterisk.show();
                    }
                }
            }
        });

        // Rank inactive teams for sorting, rank is hidden
        let sortedInactiveTeams = Object.values(this.mrdaTeams).filter(team => !team.activeStatus)
                                                        .sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedInactiveTeams.length; i++) {
            let team = sortedInactiveTeams[i];
            team.rank = sortedActiveTeams.length + i + 1;
        }

        // Set regionRank if a region is selected
        if (this.region != "GUR") {
            let regionSortedRankedTeams = Object.values(this.mrdaTeams).filter(team => team.activeStatus && team.region == this.region)
                                                        .sort((a, b) => a.rank - b.rank);
            for (let i = 0; i < regionSortedRankedTeams.length; i++) {
                let team = regionSortedRankedTeams[i];
                team.regionRank = i + 1;

                if (team.regionRank <= 5)
                    team.chart = true;
            }
        }

        // Assign potential postseason invite positions
        // Champs go to top 7 globally
        let sortedPostseasonTeams = Object.values(this.mrdaTeams).filter(team => team.postseasonEligible)
                                                .sort((a, b) => a.rank - b.rank );
        for (let i = 0; i < 7; i++) {
            let team = sortedPostseasonTeams[i];
            team.postseasonPosition = "GUR";
        }

        // Regional Qualifiers
        regions.forEach(r => {
            let qualInfo = $("#postseasonLegend .postseasonPosition-" + r + " .qualifiers");
            let inviteInfo = $("#postseasonLegend .postseasonPosition-" + r + " .invites");

            // Austrasia gets 1 spot, other regions get 2
            let spots = r == "AA" ? 1 : 2;

            let regionPostseasonTeams = Object.values(this.mrdaTeams).filter(team => team.postseasonEligible && r == team.region && team.postseasonPosition == null)
                                            .sort((a, b) => a.rank - b.rank );

            // Handle fewer postseason eligible teams in this region than spots
            if (regionPostseasonTeams <= spots){
                qualInfo.hide();
                inviteInfo.show();

                //assign the regions spots to next best eligible team in region, or next best eligible team globally.
                for (let i = 0; i < spots; i++) {
                    let team = regionPostseasonTeams[i];
                    if (team) {
                        team.postseasonPosition = r;
                    } else {
                        let globalPostseasonTeams = Object.values(this.mrdaTeams).filter(team => team.postseasonEligible && team.postseasonPosition == null)
                                                                            .sort((a, b) => a.rank - b.rank );
                        team = globalPostseasonTeams[0];
                        if (team)
                            team.postseasonPosition = r;
                    }
                }
            } else {
                qualInfo.show();
                inviteInfo.hide();
                // Assign qualifier spots up to 8
                for (let i = 0; i < Math.min(8,regionPostseasonTeams.length); i++) {
                    let team = regionPostseasonTeams[i];
                    team.postseasonPosition = r;
                }
            }
        });
    }
}
