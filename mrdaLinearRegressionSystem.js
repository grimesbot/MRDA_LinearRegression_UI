const REGIONS = ['EUR', 'AA', 'AM'];
const RATIO_CAP = 4;

function ratioCapped(homeScore,awayScore) {
    homeScore = Math.max(homeScore, 0.1);
    awayScore = Math.max(awayScore, 0.1);       
    return Math.max(Math.min(homeScore/awayScore,RATIO_CAP),1/RATIO_CAP);
}

class MrdaGame {
    constructor(game, mrdaTeams, mrdaEvents, virtualGame = false) {
        this.date = game.date instanceof Date ? game.date : new Date(game.date);
        this.homeTeamId = game.home_team_id;
        this.awayTeamId = game.away_team_id;
        this.scores = {};
        this.scores[this.homeTeamId] = game.home_team_score;
        this.scores[this.awayTeamId] = game.away_team_score;
        this.forfeit = game.forfeit;
        this.forfeitTeamId = game.forfeit_team_id;
        this.eventId = game.event_id;
        this.status = game.status;
        this.weight = game.weight;
        this.expectedRatios = {};
        this.gamePoints = {};

        this.homeTeam = mrdaTeams[this.homeTeamId];
        this.awayTeam = mrdaTeams[this.awayTeamId];

        this.event = mrdaEvents[this.eventId];

        if (virtualGame) {
            this.awayTeam = new MrdaTeam(null, { name: "Virtual Team" });
            let eventDay = `${this.date.getFullYear()}-${this.date.getMonth() + 1}-${this.date.getDate()}`;
            this.event = new MrdaEvent(null, {start_day: eventDay, end_day: eventDay, name: "Virtual Games"});
            return;
        }

        let homeRankingPoints = this.homeTeam.getRankingPoints(this.date);
        let awayRankingPoints = this.awayTeam.getRankingPoints(this.date);

        if (homeRankingPoints && awayRankingPoints) {
            this.expectedRatios[this.homeTeamId] = homeRankingPoints/awayRankingPoints;
            this.expectedRatios[this.awayTeamId] = awayRankingPoints/homeRankingPoints;
        }

        if (this.scores[this.homeTeamId] && this.scores[this.awayTeamId])
        {
            if (!this.forfeit && (homeRankingPoints || awayRankingPoints)) {
                let homeScoreRatio = ratioCapped(this.scores[this.homeTeamId],this.scores[this.awayTeamId]);
                let awayScoreRato = ratioCapped(this.scores[this.awayTeamId],this.scores[this.homeTeamId]);            
                if (homeRankingPoints && awayRankingPoints) {
                    this.gamePoints[this.homeTeamId] = homeRankingPoints * homeScoreRatio/ratioCapped(homeRankingPoints,awayRankingPoints);
                    this.gamePoints[this.awayTeamId] = awayRankingPoints * awayScoreRato/ratioCapped(awayRankingPoints,homeRankingPoints);
                } else if (homeScoreRatio < RATIO_CAP && awayScoreRato < RATIO_CAP) {
                    // Calculate game points for new team as seeding games for visualization
                    let newTeamId = homeRankingPoints ? this.awayTeamId : this.homeTeamId;
                    let establishedTeamId = homeRankingPoints ? this.homeTeamId : this.awayTeamId;
                    let establishedTeamRp = homeRankingPoints ? homeRankingPoints : awayRankingPoints;
                    this.gamePoints[newTeamId] = establishedTeamRp * this.scores[newTeamId]/this.scores[establishedTeamId];
                }
            }
        
            this.homeTeam.gameHistory.push(this);
            this.awayTeam.gameHistory.push(this);
        }
    }

    getGameSummary(teamId) {
        let opponent = null
        let vsOrAt = null;
        
        if (teamId == this.homeTeamId) {
            opponent = this.awayTeam;
            vsOrAt = "vs.";
        } else {
            opponent = this.homeTeam;
            vsOrAt = "@";
        }

        let wOrL = this.scores[teamId] > this.scores[opponent.teamId] ? "W" : "L";

        return `${this.scores[teamId]}-${this.scores[opponent.teamId]} ${wOrL} ${vsOrAt} ${opponent.name}`;
    }

    getExpectedRatio(teamId) {
        return teamId in this.expectedRatios ? this.expectedRatios[teamId].toFixed(2) : "";
    }

    getActualRatio(teamId) {
        let opponentId = teamId == this.homeTeamId ? this.awayTeamId : this.homeTeamId;
        if (this.forfeit)
            return "";
        return (this.scores[teamId]/this.scores[opponentId]).toFixed(2);
    }

    getGameDay() {
        if (this.event.startDt != this.event.endDt)
            return this.date.toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    }
}

class MrdaEvent {
    constructor(eventId, event) {
        this.eventId = eventId;
        this.startDt = new Date(event.start_day + " 00:00:00");
        this.endDt = event.start_day != event.end_day ? new Date(event.end_day + " 00:00:00") : this.startDt;
        this.name = event.name;
    }

    getDateString() {
        // Single day events
        if (this.startDt == this.endDt){
            // If the single day event has a title, return the date but don't include the weekday for brevity
            if (this.name)
                return this.startDt.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
            else
                return this.startDt.toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
        } else {
        // Multi-day events use short month for brevity
            let dtFmtOpts = {year:"numeric",month:"short",day:"numeric"};
            let dateStr = this.startDt.toLocaleDateString(undefined,dtFmtOpts);            
            if (this.startDt.getFullYear() != this.endDt.getFullYear())
                return `${dateStr} - ${this.endDt.toLocaleDateString(undefined,dtFmtOpts)}`;
            else if (this.startDt.getMonth() != this.endDt.getMonth()) {
                dtFmtOpts = {month:"short",day:"numeric"};
                let monthAndDay = this.startDt.toLocaleDateString(undefined,dtFmtOpts);
                return dateStr.replace(monthAndDay, `${monthAndDay} - ${this.endDt.toLocaleDateString(undefined,dtFmtOpts)}`);
            } else {
                dtFmtOpts = {day:"numeric"};
                let day = this.startDt.toLocaleDateString(undefined,dtFmtOpts);
                return dateStr.replace(new RegExp(`\\b${day}\\b`, "g"), `${day}-${this.endDt.toLocaleDateString(undefined,dtFmtOpts)}`);
            }
        }
    }

    getEventTitle() {
        // Single day events
        if (this.startDt == this.endDt) {
            if (this.name)
                return `${this.getDateString()}: ${this.name}`;
            else
                return this.getDateString();
        } else {
        // Multi-day events
            if (this.name)
                return this.name;
            else 
                return this.getDateString();
        }
    }

    getEventTitleWithDate() {
        if (this.name){
            let niceName = this.name.replace("Mens Roller Derby Association", "MRDA")
                                .replace("Men's Roller Derby Association", "MRDA")
                                .replace(this.startDt.getFullYear(),"").trim();
            return `${this.getDateString()}: ${niceName}`;
        } else
            return this.getDateString();
    }
}

class MrdaTeamRanking {
    constructor(date, teamId, teamRanking={}) {
        this.date = date;
        this.teamId = teamId;
        this.rankingPoints = teamRanking.rp ?? null;
        this.standardError = teamRanking.se ?? null;        
        this.relativeStandardError = teamRanking.rse ?? null;
        this.gameCount = teamRanking.gc ?? 0;
        this.activeStatus = teamRanking.as == 1;
        this.postseasonEligible = teamRanking.pe == 1;
        this.rank = teamRanking.r ?? null;
        this.regionRank = teamRanking.rr ?? null;
        this.wins = teamRanking.w ?? 0;
        this.losses = teamRanking.l ?? 0;
        this.forfeits = teamRanking.f ?? 0;
    }
}

class MrdaTeam {
    constructor(teamId, team, mrdaRankingsHistory) {
        this.teamId = teamId;
        this.name = team.name;
        this.region = team.region;
        this.location = team.location;
        this.logo = team.logo ?? "team-logos/MRDA-Logo-Acronym.png";
        if (this.logo.startsWith("/central/"))
            this.logo = "https://assets.mrda.org" + team.logo;
        this.games = []
        this.gameHistory = []
        this.activeStatus = false;
        this.postseasonEligible = false;
        this.activeStatusGameCount = 0;
        this.wins = 0;
        this.losses = 0;
        this.forfeits = 0;
        this.rankingPoints = 0;
        this.relStdErr = 0;
        this.rank = null;
        this.regionRank = null;        
        this.rankSort = null;
        this.postseasonPosition = null;
        this.chart = false;

        this.rankingHistory = new Map();

        if (mrdaRankingsHistory) {
            let lastRankings = {};
            for (const [date, rankings] of mrdaRankingsHistory) {
                if (this.teamId in rankings) {
                    this.rankingHistory.set(date,rankings[this.teamId])                  
                } else if (teamId in lastRankings) {
                    // Add empty teamRanking if they're not in current ranking but were in the last ranking.
                    this.rankingHistory.set(date,new MrdaTeamRanking(date, this.teamId))
                }
                lastRankings = rankings;
            }
        }
    }

    getRanking(date, addWeek = false, seedDate = null) {
        if (!(date instanceof Date) || addWeek)
            date = new Date(date);

        if (addWeek)
            date.setDate(date.getDate() + 7);

        if (!seedDate) {
            seedDate = new Date(date);
            seedDate.setFullYear(seedDate.getFullYear() - 1);
        }

        let latestRankingDt = [...this.rankingHistory.keys()].filter(dt => seedDate < dt && dt <= date)
            .sort((a, b) => b - a)[0];

        if (latestRankingDt)
            return this.rankingHistory.get(latestRankingDt);
        else
            return null;
    }

    getRankingPoints(date, addWeek=false, seedDate = null) {
        let ranking = this.getRanking(date, addWeek, seedDate);
        if (ranking)
            return ranking.rankingPoints;
        else
            return null;
    }

    getRankingPointsWithStandardError(date, addWeek=false, seedDate = null) {
        let ranking = this.getRanking(date, addWeek, seedDate);
        if (ranking)
            return `${ranking.rankingPoints} ±${ranking.relativeStandardError}%` ;
        else
            return null;
    }
}

class MrdaLinearRegressionSystem {
    constructor(mrda_rankings_history_json, mrda_teams_json, mrda_events_json, mrda_games_json) {
        this.mrdaRankingsHistory = new Map();
        this.mrdaTeams = {};
        this.mrdaEvents = {};
        this.mrdaGames = [];

        //this.rankingPeriodDeadlineDt = null;
        //this.rankingPeriodStartDt = null;
        //this.region = region;

        // Build mrdaRankingsHistoryDts map 
        for (const dt of Object.keys(mrda_rankings_history_json).map(day => new Date(day + " 00:00:00")).sort((a, b) => a - b)) {
            let jsonRanking = mrda_rankings_history_json[`${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`];
            let teamRankings = {};
            for (const teamId of Object.keys(jsonRanking))
                teamRankings[teamId] = new MrdaTeamRanking(dt, teamId, jsonRanking[teamId]);
            this.mrdaRankingsHistory.set(dt, teamRankings);
        };
        
        // Map all teams, events and games from raw JSON generated by python
        Object.keys(mrda_teams_json).forEach(teamId => this.mrdaTeams[teamId] = new MrdaTeam(teamId, mrda_teams_json[teamId], this.mrdaRankingsHistory));
        Object.keys(mrda_events_json).forEach(eventId => this.mrdaEvents[eventId] = new MrdaEvent(eventId, mrda_events_json[eventId]));
        this.mrdaGames = mrda_games_json.map(game => new MrdaGame(game, this.mrdaTeams, this.mrdaEvents));
    }

    getSeedDate(date) {
        let seedDate = new Date(date);
        seedDate.setDate(date.getDate() - 7 * 52);
        // If seedDate is a greater # weekday of month than date, set seedDate back an additional week
        // e.g. if date is 1st Wednesday of June, seedDate should be 1st Wednesday of June last year.
        // date = Jun 7, 2028, 52 weeks prior would seedDate = Jun 9, 2027 which is 2nd Wednesday of June.
        // set seedDate back an additional week seedDate = Jun 2, 2027 so games on weekend of Jun 4-6, 2027 count
        if (Math.floor((seedDate.getDate() - 1) / 7) > Math.floor((date.getDate() - 1) / 7))
            seedDate.setDate(seedDate.getDate() - 7);
        return seedDate;
    }

    getRankingHistory(date, seedDt = null) {
        seedDt = seedDt ?? this.getSeedDate(date);
        let latestRankingDts = [...this.mrdaRankingsHistory.keys()].filter(dt => seedDt < dt && dt <= date).sort((a,b) => b - a);
        if (latestRankingDts.length > 0)
            return this.mrdaRankingsHistory.get(latestRankingDts[0]);
        return null;
    }

    rankTeams(date, seedDt) {
        let maxRank = 0;
        // Get most recent Ranking History and apply to all teams
        let ranking = this.getRankingHistory(date, seedDt);
        for (const [teamId, team] of Object.entries(this.mrdaTeams)) {
            if (teamId in ranking) {
                let teamRanking = ranking[team.teamId];
                team.rankingPoints = teamRanking.rankingPoints;
                team.relStdErr = teamRanking.relativeStandardError;
                team.activeStatusGameCount = teamRanking.gameCount;                
                team.activeStatus = teamRanking.activeStatus;
                team.postseasonEligible = teamRanking.postseasonEligible;
                team.rank = teamRanking.rank;
                team.regionRank = teamRanking.regionRank;
                team.wins = teamRanking.wins;
                team.losses = teamRanking.losses;
                team.forfeits = teamRanking.forfeits;
            } else {
                team.rankingPoints = null;
                team.relStdErr = null;
                team.activeStatusGameCount = 0;                
                team.activeStatus = false;
                team.postseasonEligible = false;
                team.rank = null;
                team.regionRank = null;
                team.wins = 0;
                team.losses = 0;
                team.forfeits = 0;
            }
            team.rankSort = team.rank;
            if (team.rankSort > maxRank)
                maxRank = team.rank;
            team.postseasonPosition = null;
        }

        // Set rankSort for unranked teams.
        Object.values(this.mrdaTeams).filter(team => !team.rankSort)
            .sort((a, b) => b.rankingPoints - a.rankingPoints )
            .forEach(team => {
                maxRank += 1;
                team.rankSort = maxRank;
            });
        
        // Assign potential postseason invite positions
        // Champs go to top 7 globally
        let sortedPostseasonTeams = Object.values(this.mrdaTeams).filter(team => team.postseasonEligible)
                                                .sort((a, b) => a.rank - b.rank );
        for (let i = 0; i < 7; i++) {
            let team = sortedPostseasonTeams[i];
            team.postseasonPosition = "GUR";
        }

        // Regional Qualifiers
        REGIONS.forEach(r => {
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
