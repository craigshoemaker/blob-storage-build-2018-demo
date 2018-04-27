#r "Microsoft.WindowsAzure.Storage"
#r "Newtonsoft.Json"

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Web;
using System.Text;
using System.Net.Http.Headers;
using System.Net;
using System.IO;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using Microsoft.WindowsAzure.Storage.Queue;

public static async Task<HttpResponseMessage> Run(HttpRequestMessage req, TraceWriter log)
{
    log.Info("Video Indexer call back: " + req.RequestUri);

    if (req.Method != HttpMethod.Post)
    {
        return req.CreateResponse(HttpStatusCode.BadRequest, "Invalid request");
    }
         
    // parse query parameter
    string id = req.GetQueryNameValuePairs()
        .FirstOrDefault(q => string.Compare(q.Key, "id", true) == 0)
        .Value;

    string state = req.GetQueryNameValuePairs()
        .FirstOrDefault(q => string.Compare(q.Key, "state", true) == 0)
        .Value;    

    // If video is ready, download the subtitles, thumbnail into Blob and update the metadata
    string subtitleEn, subtitleJa = "";
    if (id != null && state == "Processed")
    {
        // Get subtitles (VTT) URLs from Video Indexer service
        subtitleEn = await GetVTTurlAsync(id, "en-US");
        subtitleJa = await GetVTTurlAsync(id, "ja-JP");
        
		// Get Video details: topics, duration, thumbnail
        Dictionary<string, string> videoDetails = await GetDetailsAsync(id, log);
    
		// Upload thumbnails into Blob storage and update the caption metadata
        try {
            var uploadTask = UploadFilesAsync(videoDetails, subtitleEn, subtitleJa, id, log);
            var putTask =  PutMetadaAsync(videoDetails, id, log);
            await Task.WhenAll(uploadTask, putTask);
        } catch(StorageException ex){
            var result = ex.RequestInformation.ExtendedErrorInformation.ErrorMessage;
            log.Info(result);
        }
    }

    return id == null
        ? req.CreateResponse(HttpStatusCode.BadRequest, "Please pass a name on the query string or in the request body")
        : req.CreateResponse(HttpStatusCode.OK, "Hello2");
}

static async Task UploadFilesAsync(Dictionary<string, string> videoDetails, string enUri, string jaUri, string id, TraceWriter log)
{
    
    string containerSAS = System.Environment.GetEnvironmentVariable("container_SAS", EnvironmentVariableTarget.Process);
    string thumbObjectPath = "https://build2018demo.blob.core.windows.net/web/thumbnails/" + videoDetails["name"]  + ".jpg" + containerSAS;
    string enVtt = "https://build2018demo.blob.core.windows.net/web/subtitles/en-US/" + videoDetails["name"]  + ".vtt" + containerSAS;
    string jaVtt = "https://build2018demo.blob.core.windows.net/web/subtitles/ja-JP/" + videoDetails["name"]  + ".vtt" + containerSAS;

    // Download the thumbnail and the subtitle
    Stream thumbStream = await GetToStreamAsync(videoDetails["thumbnail"]);
    Stream enStream = await GetToStreamAsync(enUri);
    Stream jaStream = await GetToStreamAsync(jaUri);

    // Upload subtitle and thumbnail to blob
    CloudBlockBlob thumbDest = new CloudBlockBlob(new Uri(thumbObjectPath));
    CloudBlockBlob subtitleEnVtt = new CloudBlockBlob(new Uri(enVtt));
    CloudBlockBlob subtitleJaVtt = new CloudBlockBlob(new Uri(jaVtt));

    var thumbTask = thumbDest.UploadFromStreamAsync(thumbStream);
    var subtitleEnTask = subtitleEnVtt.UploadFromStreamAsync(enStream);
    var subtitleJaTask = subtitleJaVtt.UploadFromStreamAsync(jaStream);

    await Task.WhenAll(thumbTask, subtitleenTask, subtitlejaTask);
    
}

static async Task PutMetadaAsync(Dictionary<string, string> videoDetails, string id, TraceWriter log)
{
    
    try {
        string containerSAS = System.Environment.GetEnvironmentVariable("container_SAS", EnvironmentVariableTarget.Process);        
        string fullObjectPath = "https://build2018demo.blob.core.windows.net/web/videos/" + videoDetails["name"] + containerSAS;

        // Save the caption as blob metadata
        CloudBlockBlob video = new CloudBlockBlob(new Uri(fullObjectPath));
        video.Metadata.Add("caption", videoDetails["topics"]);
        video.Metadata.Add("duration", videoDetails["duration"]);
        await video.SetMetadataAsync();
    } catch (Exception ex){
        log.Info(ex.Message);
    }

}

static async Task<Dictionary<string, string>> GetDetailsAsync(string id, TraceWriter log)
{
    var client = new HttpClient();

    // Prepare Video Indexer Get Details REST API
    client.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", "ae05f3b5fde84d5c98631bba555464d0");
    string uri = "https://videobreakdown.azure-api.net/Breakdowns/Api/Partner/Breakdowns/" + id + "?language=en-US";
  
    HttpResponseMessage response = await client.GetAsync(uri);
    Dictionary<string, string> details = new Dictionary<string, string>();


    if (response.IsSuccessStatusCode)
    {

         // Get and parse the JSON response
        string responseString = await response.Content.ReadAsStringAsync();
        JObject responseJson = JObject.Parse(responseString);
        string allTopics="";
        if(responseJson["summarizedInsights"]["topics"].HasValues)
        {
            var topics = responseJson["summarizedInsights"]["topics"].Children().Select(item => item.SelectToken("name"));
            allTopics = String.Join(",", topics);
        }

        details.Add("topics", allTopics);
        details.Add("duration", (string)responseJson["durationInSeconds"]);
        details.Add("thumbnail", (string)responseJson["summarizedInsights"]["thumbnailUrl"]);
        details.Add("name", (string)responseJson["summarizedInsights"]["name"]);
    }

    return details;
}

static async Task<string> GetVTTurlAsync(string id, string lang)
{
    var client = new HttpClient();

    // Request headers, response, and body
    client.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", "<video indexer subscription key>");
    HttpResponseMessage response;
    string uri = "https://videobreakdown.azure-api.net/Breakdowns/Api/Partner/Breakdowns/" + id + "/VttUrl?language=" + lang;
  
    response = await client.GetAsync(uri);

    if (response.IsSuccessStatusCode)
    {
        var result = response.Content.ReadAsStringAsync().Result;
		
		// Strip the quotes from the returned URI
        return result.Replace("\"", "");
    }

    return "Failed";
}

static async Task<Stream> GetToStreamAsync(string uri)
{
    var client = new HttpClient();

    // Request headers, response, and body
    HttpResponseMessage response = await client.GetAsync(uri);
    Stream result = null;

    if (response.IsSuccessStatusCode)
    {
        result = await response.Content.ReadAsStreamAsync();
    }

    return result;
}
