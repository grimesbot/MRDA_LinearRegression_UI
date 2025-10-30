import requests
import statsmodels.api as sm
import math
import os
import json
import time
from datetime import datetime, date, timedelta, timezone
from dateutil.relativedelta import relativedelta

from TeamInfo import team_info
from GameList_history import games, team_abbrev_id_map

RANKING_SCALE = 100 # add scale since we are not using seeds here
RATIO_CAP = 4

github_actions_run = 'GITHUB_ACTIONS' in os.environ and os.environ['GITHUB_ACTIONS'] == 'true'
github_actions_scheduled_run = github_actions_run and 'GITHUB_EVENT_NAME' in os.environ and os.environ['GITHUB_EVENT_NAME'] == 'schedule'

mrda_teams = {}
mrda_games = []

print("Initializing MRDA games list...")

# Add 2023 games from GameList_history.py to mrda_games
for game in [game for gameday in games for game in gameday]:
    forfeit = (game[2] == 0 and game[4] == 100) or (game[2] == 100 and game[4] == 0)
    mrda_games.append({
        "date": datetime.strptime(game[0] + " 12:00:00", "%Y-%m-%d %H:%M:%S"),
        "home_team_id": team_abbrev_id_map[game[1]],
        "home_team_score": game[2],
        "away_team_id": team_abbrev_id_map[game[3]],
        "away_team_score": game[4],
        "forfeit": forfeit,
        "forfeit_team_id": None if not forfeit else (team_abbrev_id_map[game[1]] if game[2] == 0 and game[4] == 100 else team_abbrev_id_map[game[3]]),
        "event_name": game[5] if len(game) > 5 else None,
        "championship": "Western Hemisphere Cup" in game[5] if len(game) > 5 else False,
        "qualifier": "Qualifiers" in game[5] if len(game) > 5 else False,
        "status": 7
    })

print("Added " + str(len(mrda_games)) + " games from 2023 in GameList_history.py")

def get_api_gamedata(startDate, status=None):
    url = "https://api.mrda.org/v1-public/sanctioning/algorithm"
    params = {
        "start-date": startDate.strftime("%m/%d/%Y"),
        "end-date": (datetime.today() + timedelta(days=1)).strftime("%m/%d/%Y") # Tomorrow to include today's games.
    }

    if not status is None:
        params["status"] = status

    response = requests.get(url, params=params)
    response.raise_for_status()  # Raises an error for bad responses

    data = response.json()
    payload = data.get('payload', [])
    
    if not data["success"]:
        print("API did not return successfully.")
        exit()

    return payload

# Get 2024+ games from API
print("Begin MRDA Central API game data retrieval...")
gamedata = get_api_gamedata(date(2024, 1, 1))
print("Retrieved " + str(len(gamedata)) + " games from >=2024 in Pending Processing or Complete status")

approved_gamedata = get_api_gamedata(datetime.today() - timedelta(days=90), 3)
print("Retrieved " + str(len(approved_gamedata)) + " games from last 90 days in Approved status")
gamedata.extend(approved_gamedata)

waiting_for_documents_gamedata = get_api_gamedata(datetime.today() - timedelta(days=90), 4)
print("Retrieved " + str(len(waiting_for_documents_gamedata)) + " games from last 90 days in Waiting for Documents status")
gamedata.extend(waiting_for_documents_gamedata)

def write_json_to_file(data, filename, var_name=None, utc_timestamp_var=None):
    # Delete if exists
    if os.path.exists(filename):
        os.remove(filename)
    # Write with optional JS variable name and optional UTC timestamp variable
    with open( filename , "w" ) as f:
        if not utc_timestamp_var is None:
            f.write(utc_timestamp_var + " = \"" + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ") + "\";\n")    
        if not var_name is None:
            f.write(var_name + " = ")
        json.dump( data , f) #, indent=4) pretty print

# Compare gamedata to JSON file from last calculation for scheduled runs.
# Only recalculate rankings if gamedata changes (manual runs always recalculate).
gamedata_json_filename = "mrda_gamedata.json"
if github_actions_scheduled_run:
    if os.path.exists(gamedata_json_filename):
        with open( gamedata_json_filename , "r" ) as f:
            file_content = f.read()
            if file_content == json.dumps(gamedata):
                # gamedata has not changed, exit without recalculating rankings
                print("Game data from MRDA Central API has not changed, exiting without recalculating rankings.")
                exit()
# Save gamedata to JSON file for future comparison.
write_json_to_file(gamedata, gamedata_json_filename)
print("MRDA Central API gamedata saved to mrda_gamedata.json for future comparison.")

# Validate and add games from API to mrda_games
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
    if not "forfeit" in data["event"]:
        continue
    if data["event"]["forfeit"] == 1 and (not "forfeit_league" in data["event"] or data["event"]["forfeit_league"] is None):
        continue

    # Map API data
    gameDate = datetime.strptime(data["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S")
    homeTeamId = str(data["event"]["home_league"]) + ("a" if data["event"]["home_league_charter"] == "primary" else "b")
    awayTeamId = str(data["event"]["away_league"]) + ("a" if data["event"]["away_league_charter"] == "primary" else "b")

    forfeit_team_id = None
    if (data["event"]["forfeit"] == 1):
        forfeit_team_id = homeTeamId if data["event"]["forfeit_league"] == data["event"]["home_league"] else awayTeamId

    # Build teams dict    
    if not homeTeamId in mrda_teams and ((homeTeamId in team_info and "name" in team_info[homeTeamId]) or ("home_league_name" in data["event"] and not data["event"]["home_league_name"] is None)):
        mrda_teams[homeTeamId] = {}
        mrda_teams[homeTeamId]["name"] = team_info[homeTeamId]["name"] if homeTeamId in team_info and "name" in team_info[homeTeamId] else data["event"]["home_league_name"] + (" (A)" if data["event"]["home_league_charter"] == "primary" else " (B)")
        mrda_teams[homeTeamId]["region"] = team_info[homeTeamId]["region"] if homeTeamId in team_info and "region" in team_info[homeTeamId] else "AM"
    if not awayTeamId in mrda_teams and ((awayTeamId in team_info and "name" in team_info[awayTeamId]) or ("away_league_name" in data["event"] and not data["event"]["away_league_name"] is None)):
        mrda_teams[awayTeamId] = {}
        mrda_teams[awayTeamId]["name"] = team_info[awayTeamId]["name"] if awayTeamId in team_info and "name" in team_info[awayTeamId] else data["event"]["away_league_name"] + (" (A)" if data["event"]["away_league_charter"] == "primary" else " (B)")
        mrda_teams[awayTeamId]["region"] = team_info[awayTeamId]["region"] if awayTeamId in team_info and "region" in team_info[awayTeamId] else "AM"        

    mrda_games.append({
        "date": gameDate,
        "home_team_id": homeTeamId,
        "home_team_score": data["event"]["home_league_score"],
        "away_team_id": awayTeamId,
        "away_team_score": data["event"]["away_league_score"],
        "forfeit": data["event"]["forfeit"] == 1,
        "forfeit_team_id": forfeit_team_id,
        "event_name": data["sanctioning"]["event_name"],
        "championship": not data["sanctioning"]["event_name"] is None and "Mens Roller Derby Association Championships" in data["sanctioning"]["event_name"],
        "qualifier": not data["sanctioning"]["event_name"] is None and "Qualifiers" in data["sanctioning"]["event_name"],
        "status": data["event"]["status"],
    })

# Remove games for excludedTeams
#excludedTeams = ["2714a", "17916a", "17915a","17910a","17911a"] #PAN, ORD, RDNA, NDT, RDT
#mrda_games = [game for game in mrda_games if not game["home_team_id"] in excludedTeams and not game["away_team_id"] in excludedTeams]

def linear_regression(games, active_status_games, seeding_team_rankings=None):
    teams = []
    for game in games:
        if not game["home_team_id"] in teams and (not game["forfeit"] or game["forfeit_team_id"] != game["home_team_id"]):
            teams.append(game["home_team_id"])
        if not game["away_team_id"] in teams and (not game["forfeit"] or game["forfeit_team_id"] != game["away_team_id"]):
            teams.append(game["away_team_id"])

    # Calculate active status and playoff eligibility
    result = {}
    for team in teams:
        game_count = 0
        unique_opponents = []
        distance_clause_applies = team in team_info and "distance_clause_applies" in team_info[team] and team_info[team]["distance_clause_applies"]
        team_games = [game for game in active_status_games if game["home_team_id"] == team or game["away_team_id"] == team]
        for game in team_games:
            if not game["forfeit"] or game["forfeit_team_id"] != team:
                game_count += 1
                opponent = game["away_team_id"] if game["home_team_id"] == team else game["home_team_id"]
                if not opponent in unique_opponents:
                    unique_opponents.append(opponent)
        active_status = game_count >= 3 and len(unique_opponents) >= 2
        result[team] = {
            "gc": game_count,
            "as": active_status,
            "pe": active_status and (game_count >= 5 or distance_clause_applies)
        }

    Y = []
    X = []
    W = []

    for game in games:

        # Skip forfeits
        if game["forfeit"]:
            continue

        # Because ln(score_ratio) is undefined if either team's score is 0, we treat a score of 0 as 0.1. 
        # A blowout game like this will have a very low weight anyway.
        home_score = game["home_team_score"] if game["home_team_score"] > 0 else 0.1
        away_score = game["away_team_score"] if game["away_team_score"] > 0 else 0.1

        # Add log of score ratio as observation 
        Y.append(math.log(home_score/away_score))
        
        # Build x column of regressors (teams) and whether they played in the game
        x_col = []
        for team in teams:
            if team == game["home_team_id"]:
                x_col.append(1)
            elif team == game["away_team_id"]:
                x_col.append(-1)
            else:
                x_col.append(0)
        X.append(x_col)

        # Calculate weight based on score ratio
        score_ratio = home_score/away_score if home_score > away_score else away_score/home_score
        if score_ratio > RATIO_CAP:
            W.append(max(3 ** ((RATIO_CAP - score_ratio)/2), 1/1000000))
        else:
            W.append(1)

    wls_stderrs = None

    # Execute StatsModels Weighted Least Squares
    wls = sm.WLS(Y, X, W).fit()
    #print(wls.summary())
    wls_result = wls.params
    #print(wls_result)
    if (wls_stderrs is None):
        wls_stderrs = wls.bse
    #print(wls_stderrs)


    for i, team in enumerate(teams):
        # Convert log results back to normal scale and multiply by 100 to get normal-looking scaled Ranking Points
        result[team]["rp"] = math.exp(wls_result[i])
        # Convert standard error
        result[team]["se"] = (math.exp(wls_stderrs[i]) - 1) * result[team]["rp"]
        # Calculate relative standard error %
        result[team]["rse"] = result[team]["se"]/result[team]["rp"] * 100
    #print(result)

    return result

rankings_history = {}

def get_ranking_history(date):
    ranking_history_dt = max([dt for dt in rankings_history.keys() if dt <= date], default=None)
    if ranking_history_dt is None:
        return None
    return rankings_history[ranking_history_dt]

last_calc_games = []
last_calc_active_status_games = []
last_calc_seeding = {}

def get_rankings(calcDate):
    global last_calc_games
    global last_calc_active_status_games
    global last_calc_seeding

    result = None

    seedDate = calcDate - relativedelta(weeks=52) #12 months in weeks
    # If seedDate is a greater # weekday of month than calcDate, set seedDate back an additional week
    # e.g. if calcDate is 1st Wednesday of June, seedDate should be 1st Wednesday of June last year.
    # calcDate = Jun 7, 2028, 52 weeks prior would seedDate = Jun 9, 2027 which is 2nd Wednesday of June.
    # set seedDate back an additional week seedDate = Jun 2, 2027 so games on weekend of Jun 4-6, 2027 count
    if (((seedDate.day - 1) // 7) > ((calcDate.day - 1) // 7)):
        seedDate = seedDate - relativedelta(weeks=1)

    # Get previously calculated rankings for seedDate
    seeding_team_rankings = get_ranking_history(seedDate)

    # If we don't have a ranking_history for the seedDate, calculate raw without seeding data and
    # use all games history we have (going back to Apr 2023). E.g. Q3-2024 rankings in Sept 2024
    # would include Apr '23-Aug'24 data which is 16 months, more than the typical 12 months.
    # But if we only use 12 months of data, Apr-Aug '23 games would fall off entirely & not contribute to
    # future seeding rankings depending on the time of the year the rankings are calculated.

    if seeding_team_rankings is None:
        games = [game for game in mrda_games if game["date"].date() < calcDate]
    else:
        games = [game for game in mrda_games if seedDate <= game["date"].date() < calcDate]

    active_status_games = [game for game in games if (not game["championship"] or game["date"].date() >= (calcDate - relativedelta(months=6))) and (not game["qualifier"] or game["date"].date() >= (calcDate - relativedelta(months=9)))]            

    # Calculate linear regression results if games, seeding rankings or active status games have changed since last calculation.    
    if games != last_calc_games or seeding_team_rankings != last_calc_seeding or active_status_games != last_calc_active_status_games:
        result = linear_regression(games, active_status_games, seeding_team_rankings)
    
    # Print sorted results for ranking deadline dates when debugging
    if not github_actions_run and calcDate.month in [3,6,9,12] and calcDate.day <= 7:
        print_result = result if not result is None else get_ranking_history(calcDate)
        print("Rankings for " + calcDate.strftime("%Y-%m-%d"))
        for item in sorted(print_result.items(), key=lambda item: item[1]["rp"], reverse=True):
            print(str(round(item[1]["rp"] * RANKING_SCALE, 2)) + "\t" + mrda_teams[item[0]]["name"])
        print("")

    if not result is None:
        last_calc_games = games
        last_calc_active_status_games = active_status_games
        last_calc_seeding = seeding_team_rankings
        
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

# Start first Wednesday after WHC
searchDate = date(2023,10,25)

print("Beginning ranking calculation...")
start_time = time.perf_counter()
calc_count = 0

# Calculate rankings for each week on Wednesday from starting date until the next ranking deadline
while (searchDate <= nextRankingDeadline):
    ranking_result = get_rankings(searchDate)
    if not ranking_result is None:
        rankings_history[searchDate] = ranking_result
        calc_count += 1
    searchDate = searchDate + timedelta(weeks=1)

print("Completed " + str(calc_count) + " ranking calculations in " + str(round(time.perf_counter() - start_time, 2)) + " seconds.")

# Format dates to Y-m-d and ranking points and error to 2 decimal points
formatted_rankings_history = {}
for dt in rankings_history.keys():
    dt_key = '{d.year}-{d.month}-{d.day}'.format(d=dt)
    formatted_rankings_history[dt_key] = {}
    for team in rankings_history[dt].keys():
        formatted_rankings_history[dt_key][team] = {}
        for key in rankings_history[dt][team]:
            if key in ["rp","se"]:
                formatted_rankings_history[dt_key][team][key] = round(rankings_history[dt][team][key] * RANKING_SCALE, 2)
            elif key == "rse":
                formatted_rankings_history[dt_key][team][key] = round(rankings_history[dt][team][key], 2)
            elif key in ["as","pe"]:
                formatted_rankings_history[dt_key][team][key] = 1 if rankings_history[dt][team][key] else 0
            else:
                formatted_rankings_history[dt_key][team][key] = rankings_history[dt][team][key]

# Save rankings JSON to JavaScript file as rankings_history variable for local web UI
write_json_to_file(formatted_rankings_history, "mrda_rankings_history.js", "rankings_history", "rankings_generated_utc")
# Save rankings JSON file for external use
write_json_to_file(formatted_rankings_history, "mrda_rankings_history.json")
print("Rankings updated and saved to mrda_rankings_history.js and mrda_rankings_history.json")

# Save mrda_teams JSON to JavaScript file for local web UI
write_json_to_file(mrda_teams, "mrda_teams.js", "mrda_teams")
# Save mrda_teams JSON file for external use
write_json_to_file(mrda_teams, "mrda_teams.json")
print("MRDA teams saved to mrda_teams.js and mrda_teams.json")

# Save mrda_games JSON to JavaScript file for local web UI, format date first
for game in mrda_games:
    game["date"] = '{d.year}-{d.month}-{d.day} {d.hour}:{d.minute:02}'.format(d=game["date"])
write_json_to_file(mrda_games, "mrda_games.js", "mrda_games")
# Save mrda_games JSON file for external use
write_json_to_file(mrda_games, "mrda_games.json")
print("MRDA games updated and saved to mrda_teams.js and mrda_teams.json")

#print teams to console for TeamInfo.py
#for item in sorted(mrda_teams.items(), key=lambda item: item[0], reverse=False):
#    print("\"" + item[0] + "\": { \"region\": \"A\", \"name\": \"" + item[1]["name"] + "\" }, # " + item[1]["name"])