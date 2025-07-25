import requests
import statsmodels.api as sm
import math
import os
import json
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta

from MrdaGame import MrdaGame
from GameList_history import games, team_abbrev_id_map

RANKING_SCALE = 100 # add scale since we are not using seeds here
RATIO_CAP = 4

mrdaGames = []

# Add games from GameList_history.py
for game in [game for gameday in games for game in gameday]:
    mrdaGames.append(MrdaGame(datetime.strptime(game[0] + " 12:00:00", "%Y-%m-%d %H:%M:%S"), team_abbrev_id_map[game[1]], game[2], team_abbrev_id_map[game[3]], game[4], False, game[0] == '2023-10-21' or game[0] == '2023-10-22'))

def get_api_gamedata(startDate, status = -1):
    # Call sanctioning API to get validated scores from Jan 2024 to today
    url = "https://api.mrda.org/v1-public/sanctioning/algorithm"
    params = {
        "start-date": startDate,
        "end-date": datetime.today().strftime("%m/%d/%Y")
    }

    if (status > -1):
        params["status"] = status

    response = requests.get(url, params=params)
    response.raise_for_status()  # Raises an error for bad responses

    data = response.json()
    payload = data.get('payload', [])
    
    if not data["success"]:
        print("API did not return successfully.")
        exit()

    return payload

# Add games from API
gamedata = get_api_gamedata("01/01/2024")
gamedata.extend(get_api_gamedata((datetime.today() - timedelta(days=30)).strftime("%m/%d/%Y"), 4))
gamedata.extend(get_api_gamedata((datetime.today() - timedelta(days=30)).strftime("%m/%d/%Y"), 3))

for data in gamedata:
    # Required fields
    if not "sanctioning" in data or data["sanctioning"] is None:
        continue
    if not "event" in data or data["event"] is None:
        continue
    if not "game_datetime" in data["event"] or data["event"]["game_datetime"] is None:
        continue
    if not "home_league" in data["event"] or data["event"]["home_league"] is None:
        continue
    if not "home_league_charter" in data["event"] or data["event"]["home_league_charter"] is None:
        continue
    if not "home_league_score" in data["event"] or data["event"]["home_league_score"] is None:
        continue
    if not "away_league" in data["event"] or data["event"]["away_league"] is None:
        continue
    if not "away_league_charter" in data["event"] or data["event"]["away_league_charter"] is None:
        continue    
    if not "away_league_score" in data["event"] or data["event"]["away_league_score"] is None:
        continue

    # Ignore forfeits
    if not "forfeit" in data["event"] or data["event"]["forfeit"] == 1:
        continue

    # Map API data
    gameDate = datetime.strptime(data["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S")
    homeTeamId = str(data["event"]["home_league"]) + ("a" if data["event"]["home_league_charter"] == "primary" else "b")
    awayTeamId = str(data["event"]["away_league"]) + ("a" if data["event"]["away_league_charter"] == "primary" else "b")
    championship = not data["sanctioning"]["event_name"] is None and "Mens Roller Derby Association Championships" in data["sanctioning"]["event_name"]
    qualifier = not data["sanctioning"]["event_name"] is None and "Qualifier" in data["sanctioning"]["event_name"]

    # Fix PAN vs PAN game, DRH is away team
    if (homeTeamId == "2714a" and awayTeamId == "2714a"):
        awayTeamId = "17404a" 
    
    mrdaGames.append(MrdaGame(gameDate, homeTeamId, data["event"]["home_league_score"], awayTeamId, data["event"]["away_league_score"], qualifier, championship))

excludedTeams = []
#excludedTeams = ["2714a", "17916a", "17915a","17910a","17911a"] #PAN, ORD, RDNA, NDT, RDT
#closeGameTeams = []

def linear_regression(calcDate):

    # Build games used for ranking and seeding
    ranking_games = []
    seeding_games = []
    for mrdaGame in mrdaGames:
        # Skip newer games than calcDate
        if mrdaGame.date.date() >= calcDate:
            continue

        if (mrdaGame.homeTeamId in excludedTeams or mrdaGame.awayTeamId in excludedTeams):
            continue

        # Games from the last year are used for ranking
        if mrdaGame.date.date() >= (calcDate - relativedelta(years=1)):
            # Championship and Qualifier games expire after 6 and 9 months respectively, use them for seeding instead of ranking
            #if (mrdaGame.championship and mrdaGame.date.date() < (calcDate - relativedelta(months=6))):
            #    seeding_games.append(mrdaGame)
            #elif (mrdaGame.qualifier and mrdaGame.date.date() < (calcDate - relativedelta(months=9))):
            #    seeding_games.append(mrdaGame)
            #else:
            #    ranking_games.append(mrdaGame)
            ranking_games.append(mrdaGame)
        #games from the previous year are used for seeding
        elif mrdaGame.date.date() >= (calcDate - relativedelta(years=2)):
        #else: #Seed data goes back to beginning of '23? e.g. Q3-2025 rankings would use >12mo for seeding (17 months, Apr '23 - Sept '24)
            # Championship and Qualifier games expire after 6 and 9 months respectively
            #if (mrdaGame.championship and mrdaGame.date.date() < (calcDate - relativedelta(years=1) - relativedelta(months=6))):
            #    continue
            #elif (mrdaGame.qualifier and mrdaGame.date.date() < (calcDate - relativedelta(years=1) - relativedelta(months=9))):
            #    continue
            #else:
            #    seeding_games.append(mrdaGame)
            seeding_games.append(mrdaGame)    

    # LINEAR REGRESSION FOR SEEDING GAMES:
    # Build all teams ids in seeding games, they're the regressors for Weighted Least Squares
    seeding_teams = []

    for game in seeding_games:
        if not game.homeTeamId in seeding_teams:
            seeding_teams.append(game.homeTeamId)
        if not game.awayTeamId in seeding_teams:
            seeding_teams.append(game.awayTeamId)

    seeding_Y = []
    seeding_X = []
    seeding_W = []

    for game in seeding_games:

        # Add observation as score log ratio
        seeding_Y.append(math.log(game.homeTeamScore/game.awayTeamScore))
        
        # Build x column of regressors (teams) and if they played in the game
        x_col = []
        for team in seeding_teams:
            if team == game.homeTeamId:
                x_col.append(1)
            elif team == game.awayTeamId:
                x_col.append(-1)
            else:
                x_col.append(0)
        seeding_X.append(x_col)

        # Calculate weight based on score ratio
        score_ratio = game.homeTeamScore/game.awayTeamScore if game.homeTeamScore > game.awayTeamScore else game.awayTeamScore/game.homeTeamScore 
        if score_ratio > RATIO_CAP:
            seeding_W.append(max(3 ** ((RATIO_CAP - score_ratio)/2), 1/1000000))
        else:
            seeding_W.append(1)

    # Execute StatsModels Weighted Least Squares
    seeding_result = sm.WLS(seeding_Y, seeding_X, seeding_W).fit().params
    # Convert log results back to normal scale and multiply by 100 to get normal-looking scaled Ranking Points
    seeding_rankings = [ math.exp(log_result) * RANKING_SCALE for log_result in seeding_result ]

    # Associate teams ids with their rankings
    seeding_teamRankings = {}
    for i, team in enumerate(seeding_teams):
        seeding_teamRankings[team] = seeding_rankings[i]

    # LINEAR REGRESSION FOR RANKING GAMES::
    # Build all teams ids in ranking games, they're the regressors for Weighted Least Squares     
    ranking_teams = []
    for game in ranking_games:    
        if not game.homeTeamId in ranking_teams:
            ranking_teams.append(game.homeTeamId)
        if not game.awayTeamId in ranking_teams:
            ranking_teams.append(game.awayTeamId)

    ranking_Y = []
    ranking_X = []
    ranking_W = []

    for game in ranking_games:

        # Add observation as score log ratio                
        ranking_Y.append(math.log(game.homeTeamScore/game.awayTeamScore))

        # Build x column of regressors (teams) and if they played in the game        
        x_col = []
        for team in ranking_teams:
            if team == game.homeTeamId:
                x_col.append(1)
            elif team == game.awayTeamId:
                x_col.append(-1)
            else:
                x_col.append(0)
        ranking_X.append(x_col)

        # Calculate weight based on score ratio
        score_ratio = game.homeTeamScore/game.awayTeamScore if game.homeTeamScore > game.awayTeamScore else game.awayTeamScore/game.homeTeamScore 
        if score_ratio > RATIO_CAP:
            ranking_W.append(max(3 ** ((RATIO_CAP - score_ratio)/2), 1/1000000))
        else:
            ranking_W.append(1)
    
    # Add virtual games for existing teams
    for team in ranking_teams:
        # Existing team if in seeding rankings
        if team in seeding_teamRankings:

            # Add observation as score log ratio
            # Virtual team's RP is 1.00. Result of virtual game is team's seeding (RP) to 1.                        
            ranking_Y.append(math.log(seeding_teamRankings[team]/1.00))

            # Build x column of regressors (teams), real team is home team (1), no away team (-1) since it was virtual team
            x_col = []
            for t in ranking_teams:
                if t == team:
                    x_col.append(1)
                else:
                    x_col.append(0)
            ranking_X.append(x_col)
            
            # Count number of close games (less than ratio cap) in the ranking_games
            #close_games_count = 0
            #for g in ranking_games:
            #    if (g.homeTeamId == team or g.awayTeamId == team) and g.homeTeamScore/g.awayTeamScore < RATIO_CAP and g.awayTeamScore/g.homeTeamScore < RATIO_CAP:
            #        close_games_count+=1

            # Set weight to near zero if there are 5 or more close games.
            #if close_games_count >= 5:
            #    ranking_W.append(1/1000000)
            #else:
            #    ranking_W.append(1)
            ranking_W.append(1)
    
    # Execute StatsModels Weighted Least Squares
    ranking_result = sm.WLS(ranking_Y, ranking_X, ranking_W).fit().params
    # Convert log results back to normal scale
    ranking_rankings = [ math.exp(log_result) for log_result in ranking_result ]

    # Associate teams ids with their rankings
    team_rankings = {}
    for i, team in enumerate(ranking_teams):
        team_rankings[team] = ranking_rankings[i]

    #return dict(sorted(team_rankings.items(), key=lambda item: item[1], reverse=True))
    return team_rankings

# Find the next ranking deadline, which is the first Wednesday of the next March, June, September or December
nextRankingDeadline = datetime.today().date()
while True: 
    if nextRankingDeadline.weekday() != 2:
        nextRankingDeadline = nextRankingDeadline + timedelta(days=1)
    else:
        if nextRankingDeadline.month in [3,6,9,12] and nextRankingDeadline.day <= 7:
            break
        else:
            nextRankingDeadline = nextRankingDeadline + timedelta(weeks=1)

# Start in Sept 2024. We only have data going back to 2023.
# Starting off, seed data will only be half of a year (Jan-Jun '23), ranking data will be full year (Jun '23-Jun '24).
searchDate = date(2024,9,4)

# Calculate rankings for each week on Wednesday from starting date until the next ranking deadline
rankings = {}
while (searchDate <= nextRankingDeadline):
    rankings[searchDate.strftime("%Y-%#m-%#d")] = linear_regression(searchDate)
    searchDate = searchDate + timedelta(weeks=1)

# Save rankings JSON to JavaScript file
json_filename = "linear_regression_rankings.js"
# Delete if exists
if os.path.exists(json_filename):
    os.remove(json_filename)
# Write with comment and JS variable name
with open( json_filename , "w" ) as f:
    f.write("//Generated by LinearRegression.py on  " + datetime.now().strftime("%Y-%#m-%#d %H:%M:%S") + "\n")
    f.write("linear_regression_ranking_history = ")
    json.dump( rankings , f )