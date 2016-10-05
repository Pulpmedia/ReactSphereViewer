var React = require('react');
var ReactDOM = require('react-dom');
var ReactSphereViewer = require('react-sphere-viewer');
var src = "example.jpg";

var App = React.createClass({
	render () {
		return (
			<div>
				<ReactSphereViewer src={src} />
			</div>
		);
	}
});
ReactDOM.render(<App />, document.getElementById('app'));
