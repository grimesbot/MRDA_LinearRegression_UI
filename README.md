This repository produces rankings for the MRDA sanctioned games score data (2023 and onward) based on the 2025 WFTDA Rankings Algorithm update proposal which 
uses linear regression to calulate rankings points.

Since MRDA produces rankings on a quarterly basis with a rolling 12 month ranking period (WFTDA uses a set season), we use the data from this season (last 12 months) 
to calculate the current rankings via linear regression using seed rankings from the last season (the 12 months prior). This seed data is also calculated using linear regression 
on last season's data but from scratch without any previous seed data.

LinearRegression.py gets 2023 game data hardcoded in Python in GameList_history.py and merges it with 2024 game data retrieved from the MRDA Central API. It caluclates 
the seed rankings (24-12 months old) and uses them to caluclate the current rankings (0-12 months old) for each Wednesday starting June 2024 through the upcoming ranking 
deadline date. LinearRegression.py writes all of this ranking data for each Wednesday calculated to a JSON object in linear_regression_rankings.js for visualization purposes.

The Web UI at index.html displays the results using linear_regression_rankings.js in a chart and a table. It also caluclates Active Status and postseason eligibility using 
games data from the MRDA Central API. Details of a team's ranking history can be seen to compare their historical ranking points via linear regression compared to the games 
played and the Game Ranking Points they would have gotten from each game in previous 2023 system.
