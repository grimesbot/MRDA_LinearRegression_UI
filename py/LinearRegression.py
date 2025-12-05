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

# Constants
RANKING_SCALE = 100 # add scale since we are not using seeds here
RATIO_CAP = 4
POSTSEASON_EVENT_NAMES = ["Western Hemisphere Cup", "Qualifiers", "Mens Roller Derby Association Championships"]
# Start calculations from first Wednesday after WHC 2023
START_DATE = date(2023,10,25)

# Most recent Q1 ranking deadline to START_DATE (First Wednesday of March)
q1_cutoff = date(2023,3,1)

github_actions_run = 'GITHUB_ACTIONS' in os.environ and os.environ['GITHUB_ACTIONS'] == 'true'
github_actions_scheduled_run = github_actions_run and 'GITHUB_EVENT_NAME' in os.environ and os.environ['GITHUB_EVENT_NAME'] == 'schedule'

# Global variables
mrda_teams = {}
mrda_events = {}
mrda_games = []
rankings_history = {}
last_games = []
last_calc_games = []
last_calc_compliance_games = []
last_calc_seeding = {}


# Methods
def get_api_gamedata(startDate, status=None):
    url = "https://api.mrda.org/v1-public/sanctioning/algorithm"
    params = {
        "start-date": startDate.strftime("%m/%d/%Y"),
        "end-date": (datetime.today() + timedelta(weeks=52)).strftime("%m/%d/%Y") # Include upcoming games
    }

    if status is not None:
        params["status"] = status

    response = requests.get(url, params=params)
    response.raise_for_status()  # Raises an error for bad responses

    data = response.json()
    payload = data.get('payload', [])
    
    if not data["success"]:
        print("API did not return successfully.")
        exit()

    return payload

def write_json_to_file(data, filename, var_name=None, utc_timestamp_var=None):
    # Delete if exists
    if os.path.exists(filename):
        os.remove(filename)
    # Write with optional JS variable name and optional UTC timestamp variable
    with open( filename , "w" ) as f:
        if utc_timestamp_var is not None:
            f.write(utc_timestamp_var + " = \"" + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ") + "\";\n")    
        if var_name is not None:
            f.write(var_name + " = ")
        json.dump( data , f) #, indent=4) pretty print

def linear_regression(games, seeding_team_rankings=None):
    result = {}

    if len(games) == 0:
        result

    team_ids = []
    for game in games:
        if not game["home_team_id"] in team_ids:
            team_ids.append(game["home_team_id"])
        if not game["away_team_id"] in team_ids:
            team_ids.append(game["away_team_id"])

    Y = []
    X = []
    W = []

    for game in games:
        # Because ln(score_ratio) is undefined if either team's score is 0, we treat a score of 0 as 0.1. 
        # A blowout game like this will have a very low weight anyway.
        home_score = max(game["home_team_score"],0.1)
        away_score = max(game["away_team_score"],0.1)

        # Add log of score ratio as observation 
        Y.append(math.log(home_score/away_score))
        
        # Build x column of regressors (teams) and whether they played in the game
        x_col = []
        for team_id in team_ids:
            if team_id == game["home_team_id"]:
                x_col.append(1)
            elif team_id == game["away_team_id"]:
                x_col.append(-1)
            else:
                x_col.append(0)
        X.append(x_col)

        # Set game weight
        W.append(game["weight"])

    # Add virtual games if we have seeding_team_rankings
    if seeding_team_rankings is not None:
        # Add virtual games for existing teams
        for team_id in team_ids:
            # Existing team if in seeding rankings
            if team_id in seeding_team_rankings:

                # Add observation as score log ratio
                # Virtual team's RP is 1.00. Result of virtual game is team's seeding (RP) to 1.                        
                Y.append(math.log(seeding_team_rankings[team_id]["rp"]/1.00))

                # Build x column of regressors (teams), real team is home team (1), no away team (-1) since it was virtual team
                x_col = []
                for t in team_ids:
                    if t == team_id:
                        x_col.append(1)
                    else:
                        x_col.append(0)
                X.append(x_col)
                
                W.append(1/4)

    # Execute StatsModels Weighted Least Squares
    wls = sm.WLS(Y, X, W).fit()
    #print(wls.summary())
    wls_result = wls.params
    #print(wls_result)
    wls_stderrs = wls.bse
    #print(wls_stderrs)

    for i, team_id in enumerate(team_ids):
        # Convert log results back to normal scale and multiply by 100 to get normal-looking scaled Ranking Points
        ranking_points = math.exp(wls_result[i])
        # Convert standard error
        standard_error = (math.exp(wls_stderrs[i]) - 1) * ranking_points
        # Calculate relative standard error %
        relative_standard_error = standard_error/ranking_points * 100
        result[team_id] = {
            "rp": ranking_points,
            "se": standard_error,
            "rse": relative_standard_error
        }

    #print(result)

    return result

def rank_teams(team_ratings, games, compliance_games):
    result = {}

    team_ids = []
    for game in games:
        if not game["home_team_id"] in team_ids:
            team_ids.append(game["home_team_id"])
        if not game["away_team_id"] in team_ids:
            team_ids.append(game["away_team_id"])

    # Calculate team metrics 
    for team_id in team_ids:
        team_result = {}
                
        wins = 0
        losses = 0
        forfeits = 0
        for game in [game for game in games if game["home_team_id"] == team_id or game["away_team_id"] == team_id]:
            if "forfeit" in game and game["forfeit"]:
                if "forfeit_team_id" in game and game["forfeit_team_id"] == team_id:
                    forfeits += 1
            elif "home_team_score" in game and "away_team_score" in game:
                team_score = game["home_team_score"] if game["home_team_id"] == team_id else game["away_team_score"]
                opponent_score = game["away_team_score"] if game["home_team_id"] == team_id else game["home_team_score"]
                if team_score > opponent_score:
                    wins += 1
                elif team_score < opponent_score:
                    losses += 1

        team_result["w"] = wins
        team_result["l"] = losses
        if forfeits > 0:
            team_result["f"] = forfeits
    
        # Active status and postseason eligibility only use compliance games
        game_count = 0
        unique_opponents = []
        distance_clause_applies = team_id in team_info and "distance_clause_applies" in team_info[team_id] and team_info[team_id]["distance_clause_applies"]
        for game in [game for game in compliance_games if game["home_team_id"] == team_id or game["away_team_id"] == team_id]:
            if ("home_team_score" in game and "away_team_score" in game and ("forfeit" not in game or not game["forfeit"])) or ("forfeit" in game and game["forfeit"] and "forfeit_team_id" in game and game["forfeit_team_id"] != team_id):
                game_count += 1
                opponent = game["away_team_id"] if game["home_team_id"] == team_id else game["home_team_id"]
                if not opponent in unique_opponents:
                    unique_opponents.append(opponent)
        active_status = game_count >= 3 and len(unique_opponents) >= 2
        postseason_eligible = active_status and (game_count >= 5 or distance_clause_applies)

        team_result["gc"] = game_count
        if active_status:
            team_result["as"] = active_status
        if postseason_eligible:
            team_result["pe"] = postseason_eligible

        result[team_id] = team_result


    # Apply Ranking Points and Error from team_ratings
    for team_id in team_ratings:
        if "rp" in team_ratings[team_id]:
            result[team_id]["rp"] = team_ratings[team_id]["rp"]
        if "se" in team_ratings[team_id]:
            result[team_id]["se"] = team_ratings[team_id]["se"]
        if "rse" in team_ratings[team_id]:
            result[team_id]["rse"] = team_ratings[team_id]["rse"]

    # Rank teams
    rank = 1
    for item in sorted({key: value for key, value in result.items() if "as" in value and value["as"]}.items(), key=lambda item: item[1]["rp"], reverse=True):
        team_id = item[0]
        team_ranking = item[1]
        result[team_id]["r"] = rank
        rank += 1

    # Apply forfeit penalties
    for item in sorted({key: value for key, value in result.items() if "r" in value and value["r"] is not None and "f" in value and value["f"] > 0}.items(), key=lambda item: item[1]["r"], reverse=True):
        team_id = item[0]
        team_ranking = item[1]
        # Two spots for teach forfeit
        for forfeit in range(team_ranking["f"]):
            for spot in range(2):
                swap_team_ids = [key for key, value in result.items() if "r" in value and value["r"] == team_ranking["r"] + 1]
                if len(swap_team_ids) > 0:
                    swap_team_id = swap_team_ids[0]
                    result[swap_team_id]["r"] -= 1
                    team_ranking["r"] += 1

    #region ranking
    for region in set([t["region"] for t in team_info.values() if "region" in t]):
        region_rank = 1
        for item in sorted({key: value for key, value in result.items() if region == mrda_teams[key]["region"] and "r" in value and value["r"] is not None}.items(), key=lambda item: item[1]["r"], reverse=False):
            team_id = item[0]
            team_ranking = item[1]
            result[team_id]["rr"] = region_rank
            region_rank += 1   

    return result

def get_seed_date(date):
    result = date - relativedelta(weeks=52) #12 months in weeks
    # If seed_date is a greater # weekday of month than date, set seed_date back an additional week
    # e.g. if date is 1st Wednesday of June, seed_date should be 1st Wednesday of June last year.
    # date = Jun 7, 2028, 52 weeks prior would seed_date = Jun 9, 2027 which is 2nd Wednesday of June.
    # set seed_date back an additional week seed_date = Jun 2, 2027 so games on weekend of Jun 4-6, 2027 count
    if (((result.day - 1) // 7) > ((date.day - 1) // 7)):
        result = result - relativedelta(weeks=1)
    return result

def get_ranking_history(date):
    seed_date = get_seed_date(date)
    ranking_history_dt = max([dt for dt in rankings_history.keys() if seed_date < dt <= date], default=None)
    return rankings_history[ranking_history_dt] if ranking_history_dt is not None else None

def get_rankings(date):
    global q1_cutoff
    global last_games
    global last_calc_games
    global last_calc_compliance_games
    global last_calc_seeding

    result = None

    seed_date = get_seed_date(date)

    # Get previously calculated rankings for seed_date
    seeding_team_rankings = get_ranking_history(seed_date)

    # If we don't have a ranking_history for the seed_date, calculate raw without seeding data and
    # use all games history we have (going back to Apr 2023). E.g. Q3-2024 rankings in Sept 2024
    # would include Apr '23-Aug'24 data which is 16 months, more than the typical 12 months.
    # But if we only use 12 months of data, Apr-Aug '23 games would fall off entirely & not contribute to
    # future seeding rankings depending on the time of the year the rankings are calculated.
    if seeding_team_rankings is None:
        games = [game for game in mrda_games if game["date"].date() < date ]
    else:
        games = [game for game in mrda_games if seed_date <= game["date"].date() < date ]

    # Filter compliance games to exclude postseason events prior to Q1 cutoff date
    compliance_games = games
    # No need to filter if we're doing the q1 calculation, but increment q1_cutoff to next year for future calculations
    if date.month == 3 and date.day <= 7:
        q1_cutoff = date
    else:
        for postseasonEventName in POSTSEASON_EVENT_NAMES:
            compliance_games = [game for game in compliance_games if "event_id" not in game or "name" not in mrda_events[game["event_id"]] or postseasonEventName not in mrda_events[game["event_id"]]["name"] or game["date"].date() >= q1_cutoff]

    # Filter forfeits from calc_games
    calc_games = [game for game in games if ("forfeit" not in game or not game["forfeit"]) and "home_team_score" in game and "away_team_score" in game]
    
    # Calculate linear regression results if calc games or seeding rankings have changed since last calculation.    
    if calc_games != last_calc_games or seeding_team_rankings != last_calc_seeding:
        team_ratings = linear_regression(calc_games, seeding_team_rankings)
        last_calc_games = calc_games
        last_calc_seeding = seeding_team_rankings
        # Always rank teams if we got new ratings
        result = rank_teams(team_ratings, games, compliance_games)
        last_games = games
        last_calc_compliance_games = compliance_games
    # if games or compliance games have changed but we didn't get new ratings, re-rank teams with last ratings
    elif games != last_games or compliance_games != last_calc_compliance_games:
        result = rank_teams(get_ranking_history(date), games, compliance_games)
        last_games = games
        last_calc_compliance_games = compliance_games
    
    # Print sorted results for ranking deadline dates when debugging
    if not github_actions_run and date.month in [3,6,9,12] and date.day <= 7:
        print_result = result if result is not None else get_ranking_history(date)
        print("Rankings for " + date.strftime("%Y-%m-%d"))
        for item in sorted(print_result.items(), key=lambda item: (item[1]["r"] if "r" in item[1] else len(print_result), - item[1]["rp"] if "rp" in item[1] else 0)):
            print(f"{item[1]["r"] if "r" in item[1] else "NR"}\t{str(round(item[1]["rp"] * RANKING_SCALE, 2)) if "rp" in item[1] else "No RP"}\t{mrda_teams[item[0]]["name"]}")
        print("")
        
    return result

print("Initializing MRDA games list...")

# Add 2023 events and games from GameList_history.py to mrda_events and mrda_games
for game_day in games:
    event_id = games.index(game_day) - len(games)
    event = {
        "start_day": game_day[0][0],
        "end_day": game_day[-1][0]
    }
    if len(game_day[0]) > 5:
        event["name"] = game_day[0][5]
    mrda_events[event_id] = event

    for game in game_day:
        mrda_game = {
            "date": datetime.strptime(game[0] + " 12:00:00", "%Y-%m-%d %H:%M:%S"),
            "home_team_id": team_abbrev_id_map[game[1]],
            "home_team_score": game[2],
            "away_team_id": team_abbrev_id_map[game[3]],
            "away_team_score": game[4],
            "event_id": event_id,
            "status": 7
        }

        if (game[2] == 0 and game[4] == 100) or (game[2] == 100 and game[4] == 0):
            mrda_game["forfeit"] = True
            mrda_game["forfeit_team_id"] = team_abbrev_id_map[game[1]] if game[2] == 0 and game[4] == 100 else team_abbrev_id_map[game[3]]

        mrda_games.append(mrda_game)

print("Added " + str(len(mrda_games)) + " games from 2023 in GameList_history.py")

# Get 2024+ games from API
print("Begin MRDA Central API game data retrieval...")
gamedata = get_api_gamedata(date(2024, 1, 1))
print("Retrieved " + str(len(gamedata)) + " games from >=2024 in Pending Processing or Complete status")

approved_gamedata = get_api_gamedata(date(2024, 1, 1), 3)
print("Retrieved " + str(len(approved_gamedata)) + " games in Approved status")
gamedata.extend(approved_gamedata)

#waiting_for_documents_gamedata = get_api_gamedata(datetime.today() - timedelta(days=45), 4)
#print("Retrieved " + str(len(waiting_for_documents_gamedata)) + " games from last 45 days in Waiting for Documents status")
waiting_for_documents_gamedata = get_api_gamedata(date(2024, 1, 1), 4)
print("Retrieved " + str(len(waiting_for_documents_gamedata)) + " games in Waiting for Documents status")
gamedata.extend(waiting_for_documents_gamedata)

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

# Validate and add data from API to mrda_events, mrda_teams and mrda_games
for data in sorted(gamedata, key=lambda x: datetime.strptime(x["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S")):
    # Required fields
    if "sanctioning" not in data or data["sanctioning"] is None:
        continue
    if "event" not in data or data["event"] is None:
        continue
    if "game_datetime" not in data["event"] or data["event"]["game_datetime"] is None:
        continue
    if "home_league" not in data["event"] or data["event"]["home_league"] is None:
        continue
    if "home_league_charter" not in data["event"] or data["event"]["home_league_charter"] is None:
        continue
    if "away_league" not in data["event"] or data["event"]["away_league"] is None:
        continue
    if "away_league_charter" not in data["event"] or data["event"]["away_league_charter"] is None:
        continue
    if "forfeit" in data["event"] and data["event"]["forfeit"] == 1 and ("forfeit_league" not in data["event"] or data["event"]["forfeit_league"] is None):
        continue

    game_date = datetime.strptime(data["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S")
    
    # Scores are not required as they're used by the upcoming games predictor, 
    # but filter out Approved games without scores older than 45 days
    if "status" in data["event"] and data["event"]["status"] == "3" and game_date < (datetime.today() - timedelta(days=45)):
        if "home_league_score" not in data["event"] or data["event"]["home_league_score"] is None:
            continue
        if "away_league_score" not in data["event"] or data["event"]["away_league_score"] is None:
            continue

    # Map API data
    home_team_id = str(data["event"]["home_league"]) + ("a" if data["event"]["home_league_charter"] == "primary" else "b")
    away_team_id = str(data["event"]["away_league"]) + ("a" if data["event"]["away_league_charter"] == "primary" else "b")

    # Add teams to mrda_teams    
    if not home_team_id in mrda_teams:
        mrda_teams[home_team_id] = {
            "name": team_info[home_team_id]["name"] if home_team_id in team_info and "name" in team_info[home_team_id] else data["event"]["home_league_name"] + (" (A)" if data["event"]["home_league_charter"] == "primary" else " (B)"),
            "region": team_info[home_team_id]["region"] if home_team_id in team_info and "region" in team_info[home_team_id] else "AM",
            "logo": data["event"]["home_league_logo"] if "home_league_logo" in data["event"] and data["event"]["home_league_logo"] is not None else team_info[home_team_id]["logo"] if "logo" in team_info[home_team_id] else None,
            "location": team_info[home_team_id]["location"] if home_team_id in team_info and "location" in team_info[home_team_id] else None
        }
    if not away_team_id in mrda_teams:
        mrda_teams[away_team_id] = {
            "name": team_info[away_team_id]["name"] if away_team_id in team_info and "name" in team_info[away_team_id] else data["event"]["away_league_name"] + (" (A)" if data["event"]["away_league_charter"] == "primary" else " (B)"),
            "region": team_info[away_team_id]["region"] if away_team_id in team_info and "region" in team_info[away_team_id] else "AM",
            "logo": data["event"]["away_league_logo"] if "away_league_logo" in data["event"] and data["event"]["away_league_logo"] is not None else team_info[away_team_id]["logo"] if "logo" in team_info[away_team_id] else None,
            "location": team_info[away_team_id]["location"] if away_team_id in team_info and "location" in team_info[away_team_id] else None
        }
        
    game = {
        "date": game_date,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "status": data["event"]["status"]
    }

    if "forfeit" in data["event"] and data["event"]["forfeit"] == 1:
        game["forfeit"] = True
        game["forfeit_team_id"] = home_team_id if data["event"]["forfeit_league"] == data["event"]["home_league"] else away_team_id

    if "home_league_score" in data["event"] and data["event"]["home_league_score"] is not None and "away_league_score" in data["event"] and data["event"]["away_league_score"] is not None:
        game["home_team_score"] = data["event"]["home_league_score"]
        game["away_team_score"] = data["event"]["away_league_score"]

    if "sanctioning_id" in data["event"] and data["event"]["sanctioning_id"] is not None:
        game["event_id"] = data["event"]["sanctioning_id"]

        # Add event to mrda_events
        game_day = '{d.year}-{d.month}-{d.day}'.format(d=game_date)
        if data["event"]["sanctioning_id"] not in mrda_events:
            event = {
                "start_day": game_day,
                "end_day": game_day
            }
            if "event_name" in data["sanctioning"] and data["sanctioning"]["event_name"] is not None:
                event["name"] = data["sanctioning"]["event_name"]
            mrda_events[data["event"]["sanctioning_id"]] = event
        elif game_day != mrda_events[data["event"]["sanctioning_id"]]["end_day"]:
            mrda_events[data["event"]["sanctioning_id"]]["end_day"] = game_day

    mrda_games.append(game)

# Remove games for excludedTeams
#excludedTeams = ["2714a", "17916a", "17915a","17910a","17911a"] #PAN, ORD, RDNA, NDT, RDT
#mrda_games = [game for game in mrda_games if not game["home_team_id"] in excludedTeams and not game["away_team_id"] in excludedTeams]

# Feature to get results for a specific event.
#mrda_games = [game for game in mrda_games if game["event_name"] == "2025 Mens Roller Derby Association Championships"]

# Feature to exclude new games to look at changes from game decay only.
# mrda_games = [game for game in mrda_games if game["date"] <= datetime(2025,10,8)]

#calculate game weights
for game in [game for game in mrda_games if ("forfeit" not in game or not game["forfeit"]) and "home_team_score" in game and "away_team_score" in game]:
    # Because score_ratio is undefined if either team's score is 0, we treat a score of 0 as 0.1. 
    # A blowout game like this will have a very low weight anyway.
    #home_score = max(game["home_team_score"], 0.1)
    #away_score = max(game["away_team_score"], 0.1)
    ## Calculate weight based on score ratio
    #score_ratio = home_score/away_score if home_score > away_score else away_score/home_score    
    game["weight"] = 1 #max(3 ** ((RATIO_CAP - score_ratio)/2), 1/1000000) if score_ratio > RATIO_CAP else 1

# Find the next ranking deadline, which is the first Wednesday of the next March, June, September or December
nextRankingDeadline = datetime.today().date()
if not (nextRankingDeadline.month % 3 == 0 and nextRankingDeadline.day <= 7 and nextRankingDeadline.weekday() <= 2):
    # Set month to next March, June, Sept or Dec
    nextRankingDeadline = nextRankingDeadline + relativedelta(months=(3-(nextRankingDeadline.month % 3)))
# Set to first of month
nextRankingDeadline = nextRankingDeadline.replace(day=1)
# Set to Wednesday = 2
nextRankingDeadline = nextRankingDeadline + timedelta(days=(2 - nextRankingDeadline.weekday() + 7) % 7)

print("Beginning ranking calculation...")
start_time = time.perf_counter()
calc_count = 0

rankingDate = START_DATE
# Calculate rankings for each week on Wednesday from starting date until the next ranking deadline
while (rankingDate <= nextRankingDeadline):
    ranking_result = get_rankings(rankingDate)
    if ranking_result is not None:
        rankings_history[rankingDate] = ranking_result
        calc_count += 1
    rankingDate = rankingDate + timedelta(weeks=1)

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

# Save mrda_events JSON to JavaScript file for local web UI
write_json_to_file(mrda_events, "mrda_events.js", "mrda_events")
# Save mrda_events JSON file for external use
write_json_to_file(mrda_events, "mrda_events.json")
print("MRDA events saved to mrda_events.js and mrda_events.json")

# Save mrda_teams JSON to JavaScript file for local web UI
write_json_to_file(mrda_teams, "mrda_teams.js", "mrda_teams")
# Save mrda_teams JSON file for external use
write_json_to_file(mrda_teams, "mrda_teams.json")
print("MRDA teams saved to mrda_teams.js and mrda_teams.json")

# Save mrda_games JSON to JavaScript file for local web UI, format date first
mrda_games = sorted(mrda_games, key=lambda game: game["date"])
for game in mrda_games:
    game["date"] = '{d.year}-{d.month}-{d.day} {d.hour}:{d.minute:02}'.format(d=game["date"])
write_json_to_file(mrda_games, "mrda_games.js", "mrda_games")
# Save mrda_games JSON file for external use
write_json_to_file(mrda_games, "mrda_games.json")
print("MRDA games updated and saved to mrda_games.js and mrda_games.json")

#print teams to console for TeamInfo.py
#for item in sorted(mrda_teams.items(), key=lambda item: item[0], reverse=False):
#    print("\"" + item[0] + "\": { \"region\": \"A\", \"name\": \"" + item[1]["name"] + "\" }, # " + item[1]["name"])