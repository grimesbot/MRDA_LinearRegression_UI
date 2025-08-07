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

# Add 2023 games from GameList_history.py
for game in [game for gameday in games for game in gameday]:
    mrdaGames.append(MrdaGame(datetime.strptime(game[0] + " 12:00:00", "%Y-%m-%d %H:%M:%S"), team_abbrev_id_map[game[1]], game[2], team_abbrev_id_map[game[3]], game[4]))

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

team_names = {}

# Add 2024+ games from API
gamedata = get_api_gamedata("01/01/2024")
# Add unvalidated games from the last 30 days
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

    # Build team names dict for console output
    if not homeTeamId in team_names and (not "home_league_name" in data["event"] or data["event"]["home_league_name"]):
        team_names[homeTeamId] = data["event"]["home_league_name"] + (" (A)" if data["event"]["home_league_charter"] == "primary" else " (B)")
    if not awayTeamId in team_names and (not "away_league_name" in data["event"] or data["event"]["away_league_name"]):
        team_names[awayTeamId] = data["event"]["away_league_name"] + (" (A)" if data["event"]["away_league_charter"] == "primary" else " (B)")
    
    mrdaGames.append(MrdaGame(gameDate, homeTeamId, data["event"]["home_league_score"], awayTeamId, data["event"]["away_league_score"]))

excludedTeams = []
#excludedTeams = ["2714a", "17916a", "17915a","17910a","17911a"] #PAN, ORD, RDNA, NDT, RDT
if len(excludedTeams) > 0:
    mrdaGames = [game for game in mrdaGames if not game.homeTeamId in excludedTeams and not game.awayTeamId in excludedTeams]

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
                Y.append(math.log(seeding_team_rankings[team]["rp"]/1.00))

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
                #    W.append(1/1000000)
                #else:
                #    W.append(1)
                W.append(1)        

    # Execute StatsModels Weighted Least Squares
    wls = sm.WLS(Y, X, W).fit()
    #print(wls.summary())
    wls_result = wls.params
    #print(wls_result)
    wls_stderrs = wls.bse
    #print(wls_stderrs)

    result = {}
    for i, team in enumerate(teams):
        result[team] = {
            # Convert log results back to normal scale and multiply by 100 to get normal-looking scaled Ranking Points
            "rp": math.exp(wls_result[i]) * ranking_scale
        }
        # Convert standard error
        result[team]["se"] = (math.exp(wls_stderrs[i]) - 1) * result[team]["rp"]
        # Calculate relative standard error %
        result[team]["rse"] = result[team]["se"]/result[team]["rp"] * 100
    #print(result)

    return result

rankings = {}        

def get_rankings(calcDate):
    result = {}

    # All caluclations prior to 2024 global champs are raw, without seeding data.
    # Use all games going back to beginning of 2023. e.g. Q3 2024 rankings in Sept 2024
    # would include Apr '23-Aug'24 data which is 16 months, more than the typical 12 months.
    # but if we only use 12 months of data, Apr-Aug '23 games would fall off entirely & not contribute to
    # future seeding rankings depending on the time of the year the rankings are calculated.
    if calcDate < date(2024,10,11):
        games = []
        for mrdaGame in mrdaGames:
            if mrdaGame.date.date() < calcDate:
                games.append(mrdaGame)

        result = linear_regression(games)
    else:
        seedDate = calcDate - relativedelta(weeks=52) #12 months in weeks
        # If seedDate is a greater # weekday of month than calcDate, set seedDate back an additional week
        # e.g. if calcDate is 1st Wednesday of June, seedDate should be 1st Wednesday of June last year.
        # calcDate = Jun 7, 2028, 52 weeks prior would seedDate = Jun 9, 2027 which is 2nd Wednesday of June.
        # set seedDate back an additional week seedDate = Jun 2, 2027 so games on weekend of Jun 4-6, 2027 count
        if (((seedDate.day - 1) // 7) > ((calcDate.day - 1) // 7)):
            seedDate = seedDate - relativedelta(weeks=1)

        # Get previously calculated rankings for seedDate        
        seeding_team_rankings = rankings[seedDate.strftime("%Y-%#m-%#d")]

        games = []
        for mrdaGame in mrdaGames:
            if (seedDate <= mrdaGame.date.date() < calcDate):
                games.append(mrdaGame)                        

        result = linear_regression(games, seeding_team_rankings)

    # Print sorted results for ranking deadline dates
    if calcDate.month in [3,6,9,12] and calcDate.day <= 7:
        print("Rankings for " + calcDate.strftime("%Y-%m-%d"))
        for item in sorted(result.items(), key=lambda item: item[1]["rp"], reverse=True):
            print(str(round(item[1]["rp"], 2)) + "\t" + team_names[item[0]])
        print("")
        
    return result

# Find the next ranking deadline, which is the first Wednesday of the next March, June, September or December
nextRankingDeadline = datetime.today().date()
if not (nextRankingDeadline.month % 3 == 0 and nextRankingDeadline.day <= 7 and nextRankingDeadline.weekday() <= 2):
    # Set month to next March, June, Sept or Dec
    nextRankingDeadline = nextRankingDeadline + relativedelta(months=(3-(nextRankingDeadline.month % 3)))
# Set to first of month
nextRankingDeadline = nextRankingDeadline.replace(day=1)
# Set to Wednesday = 2
nextRankingDeadline = nextRankingDeadline + timedelta(days=(2 - nextRankingDeadline.weekday() + 7) % 7)

# Start at Q3-2023 ranking deadline
searchDate = date(2023,9,6)

# Calculate rankings for each week on Wednesday from starting date until the next ranking deadline
while (searchDate <= nextRankingDeadline):
    rankings[searchDate.strftime("%Y-%#m-%#d")] = get_rankings(searchDate)
    searchDate = searchDate + timedelta(weeks=1)

# Format rankings 
formatted_rankings = {}
for dt in rankings.keys():
    formatted_rankings[dt] = {}
    for team, ranking in rankings[dt].items():
        formatted_rankings[dt][team] = {
            "rp": round(ranking["rp"], 2),
            "se": round(ranking["se"], 2),
            "rse": round(ranking["rse"], 2)
        }

# Save rankings JSON to JavaScript file
json_filename = "linear_regression_rankings.js"
# Delete if exists
if os.path.exists(json_filename):
    os.remove(json_filename)
# Write with comment and JS variable name
with open( json_filename , "w" ) as f:
    f.write("//Generated by LinearRegression.py on  " + datetime.now().strftime("%Y-%#m-%#d %H:%M:%S") + "\n")
    f.write("linear_regression_ranking_history = ")
    json.dump( formatted_rankings , f )