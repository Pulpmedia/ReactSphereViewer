import React, {Component,PropTypes} from 'react'
import PhotoSphereViewer from 'photo-sphere-viewer-sa'
import uEvent from 'uevent'

class ReactSphereViewer extends Component{
	componentWillMount(){
	}
	componentDidMount(){
		const {src,options} = this.props;
		this.psv = new PhotoSphereViewer({...options, panorama:src});
	}
	componentWillUnmount(){
		this.psv.destroy()
	}
	render () {
		const {options:{container}} = this.props;
		return (
		<div id={container}></div>
		);
	}
};
ReactSphereViewer.defaultProps = {
  options: {
		gyroscope: false,
		loading_text: 'loading',
		container: 'photosphere',
		navbar: 'autorotate zoom fullscreen',
		size:{
			// width: 500,
			height: 400
		}
	}
};
ReactSphereViewer.propTypes = {
    src: PropTypes.string.isRequired,
		options: PropTypes.object
}
export default ReactSphereViewer;
