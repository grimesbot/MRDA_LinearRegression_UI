import statsmodels.api as sm
import math
import time
from datetime import datetime, date, timedelta, timezone
from dateutil.relativedelta import relativedelta

from team_info import team_info
from mrda_data import mrda_teams, mrda_events, mrda_games, github_actions_run, write_json_to_file

# Constants
DIFFERENTIAL_CAP = 150
RANKING_POINT_FLOOR = 1
POSTSEASON_EVENT_NAMES = ["Western Hemisphere Cup", "Qualifiers", "Mens Roller Derby Association Championships"]
START_DATE = date(2023,10,25) # Start calculations from first Wednesday after WHC 2023

# Global variables
q1_cutoff = date(2023,3,1) # Most recent Q1 ranking deadline to START_DATE (First Wednesday of March)
rankings_history = {}
last_games = []
last_calc_games = []
last_calc_compliance_games = []
last_calc_seeding = {}
rp_min = 0
scored_games = [game for game in mrda_games if "home_team_score" in game and "away_team_score" in game] # Filter out games without scores (upcoming games)


# Methods
def linear_regression(games, seeding_team_rankings=None):
    global rp_min    
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
        # Add score differential as observation 
        Y.append(game["home_team_score"] - game["away_team_score"])
        
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

        # Calculate weight based on score differential if hasn't already been set
        if "weight" not in game:
            score_differential = abs(game["home_team_score"] - game["away_team_score"])
            game["weight"] = 0.05 + math.exp((140-score_differential)/175) if score_differential > DIFFERENTIAL_CAP else 1

        # Set weight        
        W.append(game["weight"])

    # Add virtual games if we have seeding_team_rankings
    if seeding_team_rankings is not None:
        # Add virtual games for existing teams
        for team_id in team_ids:
            # Existing team if in seeding rankings
            if team_id in seeding_team_rankings:

                # Add team's seeding RP as virtual game score differential.
                # All existing teams play a virtual team whose RP is 0
                Y.append(seeding_team_rankings[team_id]["rp"])

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
        result[team_id] = {
            "rp": wls_result[i],
            "se": wls_stderrs[i]
        }
        if wls_result[i] < rp_min:
            rp_min = wls_result[i]

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
            else:
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
            if "forfeit" not in game or not game["forfeit"] or ("forfeit" in game and game["forfeit"] and "forfeit_team_id" in game and game["forfeit_team_id"] != team_id):
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

    # Rank teams
    rank = 1
    for item in sorted({key: value for key, value in result.items() if "as" in value and value["as"]}.items(), key=lambda item: item[1]["rp"], reverse=True):
        team_id = item[0]
        team_ranking = item[1]
        result[team_id]["r"] = rank
        rank += 1

    # Apply forfeit penalties
    for team_ranking in sorted([tr for tr in result.values() if "r" in tr and tr["r"] is not None and "f" in tr and tr["f"] > 0 ], key=lambda tr: tr["r"], reverse=True):
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
        games = [game for game in scored_games if game["date"].date() < date ]
    else:
        games = [game for game in scored_games if seed_date <= game["date"].date() < date ]

    # Filter compliance games to exclude postseason events prior to Q1 cutoff date
    compliance_games = games
    # No need to filter if we're doing the q1 calculation, but increment q1_cutoff to next year for future calculations
    if date.month == 3 and date.day <= 7:
        q1_cutoff = date
    else:
        for postseasonEventName in POSTSEASON_EVENT_NAMES:
            compliance_games = [game for game in compliance_games if "event_id" not in game or "name" not in mrda_events[game["event_id"]] or postseasonEventName not in mrda_events[game["event_id"]]["name"] or game["date"].date() >= q1_cutoff]

    # Filter forfeits from calc_games
    calc_games = [game for game in games if ("forfeit" not in game or not game["forfeit"])]
    
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
            print(f"{item[1]["r"] if "r" in item[1] else "NR"}\t{str(round(item[1]["rp"] - rp_min + RANKING_POINT_FLOOR, 2)) if "rp" in item[1] else "No RP"}\t{mrda_teams[item[0]]["name"]}")
        print("")
        
    return result

def summary_to_clipboard():    
    from tkinter import Tk

    game_count = 0
    error_sum = 0
    for game in [game for game in scored_games if "forfeit" not in game or not game["forfeit"]]:
        ranking = get_ranking_history(game["date"].date())
        if ranking is not None and game["home_team_id"] in ranking and game["away_team_id"] in ranking:
            predicted_diff = ranking[game["home_team_id"]]["rp"] - ranking[game["away_team_id"]]["rp"]
            actual_diff = game["home_team_score"] - game["away_team_score"]
            error_sum += abs(predicted_diff - actual_diff)
            game_count += 1

    table_str = f"Average Error: {error_sum/game_count}\n\n"

    # Hypothetical game analysis
    home_id = "17404a" #DRH
    away_id = "13122a" #Kent
    game_dt = datetime(2025, 12, 6) #No other games on this week in history, isolated results
    
    #home_id = "2699a" #Concussion 
    #away_id = Kent #"2735a" #Toronto 
    #game_dt = datetime(2026, 2, 14) #Rainy City Rumble

    current_ranking = get_ranking_history(game_dt.date())
    home_rp = current_ranking[home_id]["rp"]
    away_rp = current_ranking[away_id]["rp"]
    table_str += f"Hypothetical game between {mrda_teams[home_id]["name"]} vs. {mrda_teams[away_id]["name"]} on {'{d.year}-{d.month}-{d.day}'.format(d=game_dt)}. Expected score ratio: {str(round(home_rp-away_rp,2))}\n\n"
    table_str += f"Ratio\t{mrda_teams[home_id]["name"]} RP Δ\t{mrda_teams[away_id]["name"]} RP Δ\tWeight\n"

    for score_differential in range(25, 801, 25):
        hypothetical_game = {
                "date": game_dt,
                "home_team_id": home_id, 
                "home_team_score": score_differential,
                "away_team_id": away_id,
                "away_team_score": 0
            }
        scored_games.append(hypothetical_game)
        new_ranking = get_rankings((game_dt + timedelta(weeks=1)).date())
        new_home_rp = new_ranking[home_id]["rp"]
        new_away_rp = new_ranking[away_id]["rp"]
        table_str += f"{score_differential}\t{str(round(new_home_rp - home_rp,2))}\t{str(round(new_away_rp - away_rp,2))}\t{hypothetical_game["weight"]}\n"
        scored_games.remove(hypothetical_game)

    # Copy to clipboard using tkinter
    r = Tk()
    r.withdraw()
    r.clipboard_clear()
    r.clipboard_append(table_str)
    r.update()
    r.destroy()

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

if not github_actions_run:
    summary_to_clipboard()

# Format dates to Y-m-d and ranking points and error to 2 decimal points
formatted_rankings_history = {}
for dt in rankings_history.keys():
    dt_key = '{d.year}-{d.month}-{d.day}'.format(d=dt)
    formatted_rankings_history[dt_key] = {}
    for team in rankings_history[dt].keys():
        formatted_rankings_history[dt_key][team] = {}
        for key in rankings_history[dt][team]:
            if key == "rp":
                formatted_rankings_history[dt_key][team][key] = round(rankings_history[dt][team][key] - rp_min + RANKING_POINT_FLOOR, 2)
            elif key == "se":
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

# Save mrda_games JSON to JavaScript file for local web UI, format date first
mrda_games = sorted(mrda_games, key=lambda game: game["date"])
for game in mrda_games:
    game["date"] = '{d.year}-{d.month}-{d.day} {d.hour}:{d.minute:02}'.format(d=game["date"])
write_json_to_file(mrda_games, "mrda_games.js", "mrda_games")
# Save mrda_games JSON file for external use
write_json_to_file(mrda_games, "mrda_games.json")
print("MRDA games updated and saved to mrda_games.js and mrda_games.json")