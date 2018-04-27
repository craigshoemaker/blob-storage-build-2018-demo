#r "Microsoft.Azure.WebJobs.Extensions.EventGrid"
#r "Microsoft.WindowsAzure.Storage"
#r "Newtonsoft.Json"

using System.Web;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using System.Net.Http.Headers;
using Newtonsoft.Json.Linq;
using Microsoft.Azure.WebJobs.Extensions.EventGrid;
using Microsoft.Azure.WebJobs.Host.Bindings.Runtime;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;

public static async Task Run(Stream myBlob, EventGridEvent myEvent, TraceWriter log)
{
    string blobUrl = (string)myEvent.Data["url"];
    Console.WriteLine(blobUrl);
	
    // Pull relevant information from App Settings
    string containerSAS = System.Environment.GetEnvironmentVariable("container_SAS", EnvironmentVariableTarget.Process);
    string fullObjectPath = blobUrl + containerSAS;
    string videoName = blobUrl.Split('/').Last();
    
    // Call Video Indexer to analyze the video 
    CloudBlockBlob rawVideo = new CloudBlockBlob(new Uri(fullObjectPath));
    await rawVideo.FetchAttributesAsync();
    if (!rawVideo.Metadata.ContainsKey("caption"))
    {

        // Construct the Video Indexer REST API, and call 
        var uri = "https://videobreakdown.azure-api.net/Breakdowns/Api/Partner/Breakdowns?name=" + videoName + "&privacy=Private&videoUrl=" + (string)myEvent.Data["url"] + "&language=en-US&callbackUrl=https://buildstoragedemo.azurewebsites.net/api/ReactToVideoIndexer";
        string caption = await MakeRequestAsync(WebUtility.HtmlEncode(fullObjectPath), uri);

        // Update the blob metada 'caption' to note that the processing has started
        rawVideo.Metadata.Add("caption", "Processing :" + caption);
        rawVideo.Metadata.Add("id", caption); // Store the process id in blob metadata as well
        await rawVideo.SetMetadataAsync();
		
        log.Info($"Found new/updated blob\n Path: \"{fullObjectPath}\"\n Caption: \"{caption}\"");
    }
    else
    {
        log.Info($"Blob is already captioned\n Path: \"{fullObjectPath}\"\n");
    }
    
}


static async Task<string> MakeRequestAsync(string videoFilePath, string uri)
{
    var client = new HttpClient();

    // Request headers, response, and body
    client.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", "<subscription key here>");
    HttpResponseMessage response;
    byte[] byteData = Encoding.UTF8.GetBytes("{body}");

    using (var content = new ByteArrayContent(byteData))
    {
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        response = await client.PostAsync(uri, content);
    }

    if (response.IsSuccessStatusCode)
    {
        // Get and parse the JSON response
        string responseString = await response.Content.ReadAsStringAsync();
		// String the quotes around the Video Indexer ID returned
        return responseString.Replace("\"", "");
    }

    string responseError = await response.Content.ReadAsStringAsync();
    return responseError;
}