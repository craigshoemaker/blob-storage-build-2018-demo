window.viewModel = {};

$(function(){

  const config = {
    blobUri: 'https://build2018demo.blob.core.windows.net/',
    sasToken: YOUR_SAS_TOKEN_HERE,
    loc: window.location.pathname,
    container:  'web', // config.loc.substring(1, config.loc.lastIndexOf('/')); //change to this when in blob storage account
  }
  
  const blobService = AzureStorage.Blob.createBlobServiceWithSas(config.blobUri, config.sasToken)
  
  const getBlobPrefix = fileName => {
    const extension = fileName.split('.').pop()
    const isImage = isImageExtension(extension)
    const isVideo = isVideoExtension(extension)
  
    let prefix = ''
  
    if (isImage || isVideo) {
      prefix = isImage ? 'images/' : 'videos/'
    }
  
    return prefix
  }

  viewModel = {
    listBlobs: prefix => {

      $('#' + prefix).html('')
  
      blobService.listBlobsSegmentedWithPrefix(config.container, prefix, null, {
        include: 'metadata'
      }, (error, results) => {
        if (error) {
          console.log('Failed to list objects')
        } else {
          let listResult = ''
  
          results.entries.forEach(blob => {
  
            const context = {
              metadata: blob.metadata.caption ? blob.metadata.caption : 'Processing...',
              duration: '',
              blobName: blob.name,
              prefix: prefix
            }
  
            if (prefix === 'videos') {
              context.thumbUri = getVideoThumbnailURI(blob.name)
              context.fullUri = getVideoFullURI(blob.name)
              context.duration = getVideoDuration(blob.metadata.duration)
            } else {
              context.thumbUri = getImageThumbnailURI(blob.name)
              context.fullUri = context.thumbUri
            }
  
            const template = Handlebars.compile($blobItemTemplate.html())
            $('#' + prefix).append(template(context))
          })
  
          Holder.run({
            images: '.placeholder'
          })
        }
      })
    },

    deleteBlob: (blobName, prefix) => {
      blobService.deleteBlob(config.container, blobName, (error, results) => {
        if (error) {
          alert('Failed to delete the object ' + blobName)
        } else {
          console.log(blobName + ' deleted')
          viewModel.listBlobs(prefix)
        }
      })
    }
  }
  
  const isVideoExtension = (extension) => /mpe?g|mp4/.test(extension)
  
  const isImageExtension = (extension) => /jpe?g|png|gif/.test(extension)
  
  const isFileFormatSupported = (prefix) => prefix.length > 0
  
  const uploadFile = (prefix, file, callback) => blobService.createBlockBlobFromBrowserFile(config.container, prefix + file.name, file, null, callback)
  
  const getVideoThumbnailURI = blobName => config.blobUri + config.container + '/thumbnails/' + blobName.split('/').pop() + '.jpg'
  
  const getVideoFullURI = blobName => config.blobUri + config.container + '/transcoded/' + blobName.split('/').pop()
  
  const getVideoDuration = duration => duration ? duration + ' sec' : ''
  
  const getImageThumbnailURI = blobName => config.blobUri + config.container + '/' + blobName

  $uploadResult = $('#uploadResult');
  $blobItemTemplate = $('#blobItemTemplate')

  $('#uploadFile').on('change', () => {

    $uploadResult.html('Uploading ...')
  
    const file = $('#uploadFile').prop('files')[0]
    console.log(file)

    const prefix = getBlobPrefix(file.name);

    if(isFileFormatSupported(prefix)){

      uploadFile(prefix, file, (error, result, response) => {
        if (error) {
          alert(error)
        } else {
          $uploadResult.html('Done!')
          setTimeout(() => {
            $uploadResult.html('Upload a new file!')
            viewModel.listBlobs('images')
            viewModel.listBlobs('videos')
          }, 2000)
        }
      })

    } else {
      alert('File format not supported')
      $uploadResult.html('Upload a new file')
    }
  })

  $('#viewMedia').on('show.bs.modal', (e) => {
    const source = $(e.relatedTarget).attr('data-src')
    const extension = source.split('.').pop()

    if (isVideoExtension(extension)) {

      $('#video').remove()

      const video = $('<video />', {
        id: 'video',
        controls: true,
        width: '100%'
      })

      const videosource = $('<source />', {
        src: source,
        type: 'video/mp4'
      })

      videosource.appendTo(video)

      const enTrack = $('<track />', {
        id: 'en-track',
        src: (source.replace('transcoded/', 'subtitles/en-US/') + '.vtt'),
        label: 'English',
        kind: 'subtitles',
        srclang: 'en'
      })

      const jaTrack = $('<track />', {
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
  
  $('#viewMedia').on('hide.bs.modal', (e) => {
    if ($('video')[0]) {
      $('video')[0].pause()
    }
    $('.img-responsive').removeAttr('src')
    $('.video-responsive').removeAttr('src')
    $('.video-responsive').prop('hidden', true)
  })
  
  viewModel.listBlobs('images')
  viewModel.listBlobs('videos')
  
  // Azure Search Code
  // Initialize and connect to your search service
  const automagic = new AzSearch.Automagic({
    index: 'video-index',
    queryKey: '879818179156303DCBDFF90E8C4D4CD5',
    service: 'builddemosearchservice'
  })
  
  const css = {
    searchResults__result: 'col-md-4'
  }

  automagic.addResults('results', {
    count: true
  }, $('#resultTemplate').html(), css)
  
  automagic.addPager('pager')
  automagic.addSearchBox('searchBox')

})