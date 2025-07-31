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

def linear_regression(games=[],seeding_team_rankings=None):
    teams = []
    for game in games:
        if not game.homeTeamId in teams:
            teams.append(game.homeTeamId)
        if not game.awayTeamId in teams:
            teams.append(game.awayTeamId)

    Y = []
    X = []
    W = []

    for game in games:

        # Add observation as score log ratio
        Y.append(math.log(game.homeTeamScore/game.awayTeamScore))
        
        # Build x column of regressors (teams) and whether they played in the game
        x_col = []
        for team in teams:
            if team == game.homeTeamId:
                x_col.append(1)
            elif team == game.awayTeamId:
                x_col.append(-1)
            else:
                x_col.append(0)
        X.append(x_col)

        # Calculate weight based on score ratio
        score_ratio = game.homeTeamScore/game.awayTeamScore if game.homeTeamScore > game.awayTeamScore else game.awayTeamScore/game.homeTeamScore 
        if score_ratio > RATIO_CAP:
            W.append(max(3 ** ((RATIO_CAP - score_ratio)/2), 1/1000000))
        else:
            W.append(1)

    # If no seeding data, don't add virtual games, just set ranking_scale multiplier to 100
    if seeding_team_rankings is None:
        ranking_scale = RANKING_SCALE
    # If we have seeding data, add virtual games & set ranking_scale to 1   
    else:
        ranking_scale = 1
        # Add virtual games for existing teams
        for team in teams:
            # Existing team if in seeding rankings
            if team in seeding_team_rankings:

                # Add observation as score log ratio
                # Virtual team's RP is 1.00. Result of virtual game is team's seeding (RP) to 1.                        
                Y.append(math.log(seeding_team_rankings[team]/1.00))

                # Build x column of regressors (teams), real team is home team (1), no away team (-1) since it was virtual team
                x_col = []
                for t in teams:
                    if t == team:
                        x_col.append(1)
                    else:
                        x_col.append(0)
                X.append(x_col)
                
                # Count number of close games (less than ratio cap)
                #close_games_count = 0
                #for g in games:
                #    if (g.homeTeamId == team or g.awayTeamId == team) and g.homeTeamScore/g.awayTeamScore < RATIO_CAP and g.awayTeamScore/g.homeTeamScore < RATIO_CAP:
                #        close_games_count+=1

                # Set weight to near zero if there are 5 or more close games.
                #if close_games_count >= 5:
                #    ranking_W.append(1/1000000)
                #else:
                #    ranking_W.append(1)
                W.append(1)        

    # Execute StatsModels Weighted Least Squares
    wls = sm.WLS(Y, X, W).fit()
    #print(wls.summary())
    #print(wls.params)
    #print(wls.bse)
    wls_result = wls.params

    # Convert log results back to normal scale and multiply by 100 to get normal-looking scaled Ranking Points
    ranking_points = [ math.exp(log_result) * ranking_scale for log_result in wls_result ]

    #print (ranking_points)
    # Associate teams ids with their rankings
    team_rankings = {}
    for i, team in enumerate(teams):
        team_rankings[team] = ranking_points[i]

    return team_rankings

def get_rankings(calcDate, seedingCalc=False):
    seedDate = calcDate - relativedelta(weeks=52)
    if (calcDate.month in [3,6,9,12] and calcDate.day <= 7 and seedDate.day > 7):
        seedDate = seedDate - relativedelta(weeks=1)

    # All caluclations prior to 2024 global champs are raw, without seeding data
    if calcDate < date(2024,10,11):
        games = []
        for mrdaGame in mrdaGames:
            # Skip newer games than calcDate
            if mrdaGame.date.date() >= calcDate:
                continue

            if (mrdaGame.homeTeamId in excludedTeams or mrdaGame.awayTeamId in excludedTeams):
                continue

            games.append(mrdaGame)
        
        return linear_regression(games)
    else:
        seeding_team_rankings = get_rankings(seedDate, True)        

        games = []
        for mrdaGame in mrdaGames:
            # Skip newer games than calcDate
            if mrdaGame.date.date() >= calcDate:
                # Unless calculating seeding, then include postseason games in the next 3/6 months, since 6/9+ old postseason games are excluded from ranking
                #if (seedingCalc):
                #    if (mrdaGame.championship and mrdaGame.date.date() <= (calcDate + relativedelta(months=6))):
                #        games.append(mrdaGame)
                #    elif (mrdaGame.qualifier and mrdaGame.date.date() <= (calcDate + relativedelta(months=3))):
                #        games.append(mrdaGame)
                continue

            if (mrdaGame.homeTeamId in excludedTeams or mrdaGame.awayTeamId in excludedTeams):
                continue

            if mrdaGame.date.date() >= seedDate:
                # Championship and Qualifier games expire after 6 and 9 months respectively, use them for seeding instead of ranking
                #if (mrdaGame.championship and mrdaGame.date.date() < (calcDate - relativedelta(months=6))):
                #    continue
                #elif (mrdaGame.qualifier and mrdaGame.date.date() < (calcDate - relativedelta(months=9))):
                #    continue
                #else:
                #    games.append(mrdaGame)
                games.append(mrdaGame)
        return linear_regression(games, seeding_team_rankings)

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

# Start first Wednesday after 2024 global champs.
searchDate = date(2024,10,16)

# Calculate rankings for each week on Wednesday from starting date until the next ranking deadline
rankings = {}
while (searchDate <= nextRankingDeadline):
    rankings[searchDate.strftime("%Y-%#m-%#d")] = get_rankings(searchDate)
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