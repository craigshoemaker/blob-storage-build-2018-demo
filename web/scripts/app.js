// Upload videos/images to Blob storage
$('#uploadFile').on('change', function () {
  // Update value
  $('#uploadResult').html('Uploading ...')

  var file = $('#uploadFile').prop('files')[0]
  console.log(file)

  // Image or video upload ?
  var fileExtension = file.name.split('.').pop()
  var blobPrefix = 'images/'
  var isImage = /jpe?g|png|gif/.test(fileExtension)
  var isVideo = /mpe?g|mp4/.test(fileExtension)

  if (isImage || isVideo) {
    blobPrefix = isImage ? 'images/' : 'videos/'
  } else {
    alert('File format not supported')
    $('#uploadResult').html('Upload a new file')
    return
  }

  // Upload the file, and update the screen
  blobService.createBlockBlobFromBrowserFile(container, blobPrefix + file.name, file, null, function (error, result, response) {
    if (error) {
      alert(error)
    } else {
      $('#uploadResult').html('Done!')
      setTimeout(function () {
        $('#uploadResult').html('Upload a new file!')
        listBlobs('images')
        listBlobs('videos')
      }, 2000)
    }
  })
})

$('#viewMedia').on('show.bs.modal', function (e) {
  var source = $(e.relatedTarget).attr('data-src')
  var extension = source.split('.').pop()
  if (/mpe?g|mp4/.test(extension)) {
    $('#video').remove()
    var video = $('<video />', {
      id: 'video',
      controls: true,
      width: '100%'
    })
    var videosource = $('<source />', {
      src: source,
      type: 'video/mp4'
    })
    videosource.appendTo(video)
    var enTrack = $('<track />', {
      id: 'en-track',
      src: (source.replace('transcoded/', 'subtitles/en-US/') + '.vtt'),
      label: 'English',
      kind: 'subtitles',
      srclang: 'en'
    })
    var jaTrack = $('<track />', {
      id: 'ja-track',
      src: (source.replace('transcoded/', 'subtitles/ja-JP/') + '.vtt'),
      label: 'Japanese',
      kind: 'subtitles',
      srclang: 'ja'
    })
    enTrack.appendTo(video)
    jaTrack.appendTo(video)
    video.appendTo($('#media'))

    $('.img-responsive').removeAttr('src')
  } else {
    $('#video').remove()
    $('.img-responsive').attr('src', source)
  }
})

$('#viewMedia').on('hide.bs.modal', function (e) {
  if ($('video')[0]) {
    $('video')[0].pause()
  }
  $('.img-responsive').removeAttr('src')
  $('.video-responsive').removeAttr('src')
  $('.video-responsive').prop('hidden', true)
})

// List blobs in the given prefix
function listBlobs (prefix) {
  blobService.listBlobsSegmentedWithPrefix(container, prefix, null, {
    include: 'metadata'
  }, function (error, results) {
    if (error) {
      console.log('Failed to list objects')
    } else {
      var listResult = ''
      for (var i = 0, blob; blob = results.entries[i]; i++) {
        var metadata = ''
        metadata = blob.metadata.caption ? blob.metadata.caption : 'Processing...'
        var thumbUri, fullUri, duration = ''
        if (prefix === 'videos') {
          thumbUri = blobUri + container + '/thumbnails/' + blob.name.split('/').pop() + '.jpg'
          fullUri = blobUri + container + '/transcoded/' + blob.name.split('/').pop()
          duration = blob.metadata.duration ? blob.metadata.duration + ' sec' : ''
        } else {
          thumbUri = blobUri + container + '/' + blob.name
          fullUri = thumbUri
        }
        listResult += '<div class="col-md-4"><div class="card mb-4 box-shadow"><img class="card-img-top placeholder" alt="' + metadata + '" src="' + thumbUri + '" onerror="this.src=\'style/no-image.jpg\'"><div class="card-body"><p class="card-text">' + metadata + '</p><div class="d-flex justify-content-between align-items-center"><div class="btn-group"><button type="button" class="btn btn-primary"  data-toggle="modal" data-target="#viewMedia" data-src="' + fullUri + '">View</button><button type="button" class="btn btn-sm btn-outline-secondary" onClick="deleteBlob(\'' + blob.name + '\', \'' + prefix + '\');">Delete</button></div><i>' + duration + '</i></div></div></div></div>'
      }
      grid = $('#' + prefix)
      grid.html(listResult)
      Holder.run({
        images: '.placeholder'
      })
    }
  })
}

// Delete a given blob
function deleteBlob (blobName, prefix) {
  blobService.deleteBlob(container, blobName, function (error, results) {
    if (error) {
      alert('Failed to delete the object ' + blobName)
    } else {
      console.log(blobName + ' deleted')
      listBlobs(prefix)
    }
  })
}

// Helper function to update the upload result
function updateResult (text) {
  $('#uploadResult').html(text)
}

// Connect to Blob Storage
var blobUri = 'https://build2018demo.blob.core.windows.net/'
var loc = window.location.pathname
var container = 'web' // loc.substring(1, loc.lastIndexOf('/')); !change to this when in blob storage account

// Place the SAS token here
var sasToken = ''
var blobService = AzureStorage.Blob.createBlobServiceWithSas(blobUri, sasToken)
listBlobs('images')
listBlobs('videos')

// Azure Search Code
// Initialize and connect to your search service
var automagic = new AzSearch.Automagic({
  index: 'video-index',
  queryKey: '879818179156303DCBDFF90E8C4D4CD5',
  service: 'builddemosearchservice'
})

// add a results view using the template defined above
var resultTemplate =
  `<div class="card mb-4 box-shadow">
    <img class="card-img-top placeholder" alt="{{caption}}" src="thumbnails/{{metadata_storage_name}}.jpg" >
    <div class="card-body">
      <p class="card-text">{{caption}}</p>
      <div class="d-flex justify-content-between align-items-center">
        <div class="btn-group">
          <button type="button" class="btn btn-primary" data-toggle="modal" data-target="#viewMedia" data-src="transcoded/{{metadata_storage_name}}">View</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" onClick="deleteBlob('{{metadata_storage_name}}', 'videos');">Delete</button>
        </div>
        <i>{{duration}}</i>
      </div>
    </div>
  </div>`

var css = {
  searchResults__result: 'col-md-4'
}
automagic.addResults('results', {
  count: true
}, resultTemplate, css)
automagic.addPager('pager')
automagic.addSearchBox('searchBox')
